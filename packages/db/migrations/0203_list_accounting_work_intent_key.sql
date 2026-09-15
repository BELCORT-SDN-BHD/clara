-- 0203_list_accounting_work_intent_key — #809: ONE LIST READER OF clara.accounting_work.
-- =====================================================================================
-- Spec of record: issue #809 and the Agent Brief in its triage comment; the finding it acts on is
-- docs/plan/active/refresh-wave-2026-09-14/reports/wave2-integration.md. Domain words: CONTEXT.md
-- — "Accounting work". The owner has taken the WIDEN-AND-CONVERGE branch; the weaker-label
-- alternative the ticket also named is out of scope.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.list_accounting_work` (0189) projects ONE more
-- field, `intent_key`, taken straight from the column, so the plan authority picker can read its
-- candidates through this door instead of through the direct table read wave-2 integration left
-- beside it.
--
-- =====================================================================================
-- WHY THERE WERE TWO READERS, AND WHY ONE IS ENOUGH NOW.
--
-- #640's plan form called `listAccountingWork` — a plain filtered PostgREST GET in
-- apps/web/lib/work/reads.ts. #641, in the SAME wave, deleted that reader: both Work LISTS moved
-- to this door. The integration worker could not simply repoint the picker, because the picker
-- labels a candidate by its basis memo falling back to its `intent_key`, and this door's
-- projection deliberately carried neither the `basis` object nor `intent_key`. Rather than
-- contradict a committed decision, the integrator moved the direct read to
-- apps/web/lib/plans/api.ts and recorded the divergence. So "what accounting Work does this client
-- have" had two answers again, which is exactly the condition a reader picks the wrong one of.
--
-- THE MEMO WAS NEVER THE PROBLEM: this door has projected `w.basis->>'memo'` as a FLAT field since
-- 0189. Only `intent_key` was missing, and it is a plain NOT NULL text column (0178) — one
-- projection, no join, no new source, no widening of what a list may say. `basis` itself stays
-- off the row: 0189's "a list of operations is not a ledger" is untouched.
--
-- =====================================================================================
-- A BODY-ONLY `CREATE OR REPLACE`, AT THE EXISTING SIGNATURE — NEVER A DROP AND RE-CREATE.
--
-- This door returns a jsonb ENVELOPE rather than a table, so adding a projection field changes
-- nothing about its signature or its return type: `create or replace` is legal and is the only
-- correct shape here. A drop-and-recreate would take the function's owner, its PUBLIC revoke, its
-- clara_authenticated grant and its comment with it, for a change that needs none of that moved.
-- (Contrast 0202, which had to drop: it ADDED a parameter, which `create or replace` cannot do.)
--
-- BUT A REPLACE RESTATES THE WHOLE DEFINITION, so the three things that live on the definition
-- rather than on the catalog entry must be written again or they are silently dropped:
--   `security invoker`, `set search_path = clara, pg_temp`, `set plan_cache_mode = force_custom_plan`.
-- §T re-reads all three from pg_proc, together with the owner and the literal ACL, which the
-- replace does NOT touch and which this file therefore asserts are UNCHANGED.
--
-- 0189 IS NOT EDITED and nothing later in the chain re-cuts this body: §0 sha-pins the live text
-- at 0189's own, and refuses on drift rather than overwriting a body it never read — the same
-- discipline 0183/0184/0202 apply to the activity door.
--
-- WHAT DOES NOT CHANGE: the signature, the nine filter axes and their refusals, the keyset
-- contract and its cursor, the two-pass shape, the inline bookkeeper floor, the SECURITY INVOKER
-- posture, the roster, the grants and the RLS. This is a projection widen and nothing else.
--
-- =====================================================================================
-- AND THE SIBLING DOOR MOVES WITH IT — clara.get_accounting_work_row.
--
-- 0189 shipped the ADDRESSED single-row read as a second body carrying a HAND-COPIED duplicate of
-- the list's projection, and said so in its own comment: "ONE Work in the SAME projection
-- clara.list_accounting_work emits". Three things depend on that identity being true rather than
-- aspirational:
--   * the database battery asserts it — packages/db/tests/work-list.test.mjs wl.13, "carries the
--     same projection a list row does";
--   * apps/web/lib/work/work-list.ts types BOTH doors' answers as ONE `WorkListRow`, and that
--     type's own rule is that a field a door can leave absent is typed nullable — so widening the
--     list alone would have typed `intent_key` as a non-nullable string on a row one of the two
--     doors does not carry;
--   * #719's whole point is that the addressed row and a list row are interchangeable to a
--     surface that may have arrived by deep link instead of by paging.
-- So the same ONE field is added to the same place in both projections. No caller reads it on the
-- addressed row today; it is here so the two cannot drift. This door is likewise a body-only
-- `create or replace` at its existing signature, with the same three clauses restated and the
-- same sha pin on its 0189 text.
--
-- A CONSEQUENCE WORTH NAMING, because it is a real behaviour change for ONE caller: routing the
-- plan authority picker through this door raises its read floor from "any authenticated member"
-- to BOOKKEEPER — the floor `clara.create_accounting_plan` already enforces for the write the
-- picker exists to prepare. A caller below that floor now meets a CLR04 refusal, which the form
-- must render as an error and never as "this client has no instructions"; the web cell
-- apps/web/lib/plans/api.test.ts pins exactly that.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: THE SAME FOUR AS 0189.
--
-- clara.list_accounting_work                                (human read door)
--   CLR04 'no authenticated actor' / 'actor has no active membership' / 'insufficient role'
--   CLR10 detail.reason='invalid_status'   — a status outside the closed nine (a NULL included)
--   CLR10 detail.reason='invalid_purpose'  — a NULL purpose element
--   CLR10 detail.reason='invalid_cursor'   — a malformed or non-finite p_cursor
--
-- A projected column adds none: `intent_key` is NOT NULL on the table and is read, never parsed.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $w809_pre$
declare n text; v_src text; v_n int; v_missing text;
begin
  -- 0.1 · the door itself and the helpers its body calls, in exact regprocedure form.
  foreach n in array array[
    'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)',
    'clara._work_run_attempts(uuid[])',
    'clara.jwt_sub()',
    'clara.jwt_firm()',
    'clara.actor_role_rank()',
    'clara.role_rank(text)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#809 prestate: prerequisite absent: % (migration 0189 has not been applied)', n
        using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · THE COLUMN THIS FILE PROJECTS, and the NOT NULL that lets the web row type carry it as a
  -- non-nullable string. A nullable column would make the widen a lie in the type, not merely in
  -- the data.
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='accounting_work' and column_name='intent_key') then
    raise exception '#809 prestate: clara.accounting_work.intent_key is absent' using errcode='CLR10';
  end if;
  if exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='accounting_work' and column_name='intent_key'
        and is_nullable = 'YES') then
    raise exception '#809 prestate: clara.accounting_work.intent_key is NULLABLE -- the widened row type claims it is not'
      using errcode='CLR10';
  end if;

  -- 0.3 · EXACTLY ONE body of this name, and it is 0189's -- pinned by prosrc sha-256, because
  -- §W below is a FULL-BODY restatement of that exact text plus one projected column, and a
  -- drifted body may carry an arm this file would delete without ever having read it.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_accounting_work';
  if v_n <> 1 then
    raise exception '#809 prestate: clara.list_accounting_work has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if v_src is distinct from '0d00848025ecc3154645328c35b319474a8a54a4448f1e77d51a26df43ba7b8a' then
    raise exception '#809 prestate: clara.list_accounting_work has DRIFTED from the pinned 0189 body (sha %) -- re-derive section W against the live body before applying', v_src
      using errcode='CLR10';
  end if;

  -- 0.4 · IT DOES NOT ALREADY PROJECT intent_key. Stated separately from the sha so a re-run
  -- against an already-widened database says WHY it is refusing.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if position('intent_key' in v_src) <> 0 then
    raise exception '#809 prestate: the live clara.list_accounting_work ALREADY projects intent_key -- this file has nothing to add and would silently re-write somebody else''s body'
      using errcode='CLR10';
  end if;

  -- 0.5 · the arms this file carries over unchanged, named one by one, so a reader of the failure
  -- knows WHICH property the sha was standing for.
  v_missing := '';
  if position('role_rank(''bookkeeper'')' in v_src) = 0 then v_missing := v_missing || ' bookkeeper-floor'; end if;
  if position('least(greatest(coalesce(p_limit, 25), 1), 100)' in v_src) = 0 then v_missing := v_missing || ' limit-clamp'; end if;
  if position('array_length(p_status, 1) is null' in v_src) = 0 then v_missing := v_missing || ' empty-array-is-no-filter'; end if;
  if position('invalid_status' in v_src) = 0 then v_missing := v_missing || ' status-roster'; end if;
  if position('invalid_purpose' in v_src) = 0 then v_missing := v_missing || ' purpose-null-refusal'; end if;
  if position('non-finite cursor timestamp' in v_src) = 0 then v_missing := v_missing || ' non-finite-cursor-refusal'; end if;
  if position('coalesce(w.initiated_by, w.initiator) = p_initiator' in v_src) = 0 then v_missing := v_missing || ' entered-by-filter'; end if;
  if position('clara._work_run_attempts(v_ids)' in v_src) = 0 then v_missing := v_missing || ' attempts-helper'; end if;
  if v_missing <> '' then
    raise exception '#809 prestate: the live clara.list_accounting_work is not 0189''s body -- missing arm(s):%', v_missing
      using errcode='CLR10';
  end if;

  -- 0.5b · THE SIBLING DOOR, pinned the same way and for the same reason: §W2 restates its body
  -- too, and it must be 0189's text.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if v_src is distinct from '3c5f626e47d839d118ce7d91cf58598beac21a7fe457f227526ff85b97823ec3' then
    raise exception '#809 prestate: clara.get_accounting_work_row has DRIFTED from the pinned 0189 body (sha %) -- re-derive section W2 against the live body before applying', v_src
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if position('intent_key' in v_src) <> 0 then
    raise exception '#809 prestate: the live clara.get_accounting_work_row ALREADY projects intent_key' using errcode='CLR10';
  end if;

  -- 0.6 · the posture a REPLACE preserves (owner, ACL) and the three it restates. Measured here so
  -- §T's re-read is a COMPARISON and not a hopeful assertion.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_src from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if v_src is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#809 prestate: clara.list_accounting_work does not carry the posture this file must preserve; got {%}', v_src
      using errcode='CLR10';
  end if;

  raise notice '#809 prestate: clean -- clara.list_accounting_work exists exactly once at its nine-argument signature, carries 0189''s body byte-for-byte (sha-pinned) with every arm this file keeps, does NOT yet project intent_key, and clara.accounting_work.intent_key is present and NOT NULL; the door is owned by clara_fn_owner, SECURITY INVOKER, search_path- and plan_cache_mode-pinned, PUBLIC-revoked and clara_authenticated-granted.';
end
$w809_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §W THE WIDEN. 0189's body, byte-for-byte, plus ONE projected column.
--
-- The three clauses below are RESTATED, not inherited: a `create or replace` restates the whole
-- definition, so an omitted `security invoker` would silently make this door SECURITY DEFINER and
-- an omitted pin would hand a pooled connection a generic plan from its sixth call. §T re-reads
-- all three from the catalog.
-- =====================================================================================
create or replace function clara.list_accounting_work(
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
        -- #809: THE ONE ADDED FIELD. Taken straight from the column, which is NOT NULL on
        -- clara.accounting_work (0178), so the row type carries it as a non-nullable string. It
        -- exists because the plan authority picker labels a candidate by its basis memo and falls
        -- back to the intent key when there is none -- and that picker was, until this file, the
        -- SECOND list reader of clara.accounting_work, written direct against the table precisely
        -- because this projection omitted this field. No `basis` object joins it: 0189's "a list
        -- of operations is not a ledger" stands, and the memo already arrives flat below.
        w.intent_key                              as intent_key,
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

-- THE COMMENT, restated because the row shape it describes has changed. `comment on function` is
-- independent of `create or replace` (the old comment would otherwise have survived, describing a
-- projection that no longer matches), so this is a deliberate re-issue rather than a repair.
comment on function clara.list_accounting_work(uuid, text[], uuid, text[], timestamptz, timestamptz, text, text, int) is
  '#641 B3, widened #809. The Work list behind /work (firm-wide) and /clients/:id/work, and — '
  'since #809 — the plan authority picker''s ONE reader of clara.accounting_work: keyset-paged '
  'over (created_at desc, id desc), filterable by client/status/initiator/purpose/[since,until)/'
  'free text, newest first. SECURITY INVOKER over clara.accounting_work, clara.agent_interruptions '
  'and clara.clients (all three already clara_authenticated-granted with firm-scoped RLS); refuses '
  'CLR04 below bookkeeper before reading. p_status is the closed nine-member roster, refused '
  'CLR10 invalid_status otherwise (a NULL element included); p_purpose''s VOCABULARY is NOT '
  'validated (0178''s CHECK owns it and concurrent lanes are widening it) so an unknown purpose '
  'matches nothing, but a NULL element is refused CLR10 invalid_purpose. p_initiator filters '
  'coalesce(initiated_by, initiator) -- WHO ASKED, the expression the Entered-by column renders -- '
  'not the mutable run authority a Take-over moves. p_q matches the '
  'basis memo by case-insensitive CONTAINMENT, never as a LIKE pattern. p_limit clamps 1..100. '
  'p_cursor is an opaque base64 pair minted by a previous page''s next_cursor; a malformed one '
  'refuses CLR10 invalid_cursor. Every row carries attempts + the pending question id/version so '
  'a caller''s status LABEL is derived from canonical state; no money is projected. #809 adds ONE '
  'field, intent_key, straight from the NOT NULL column, so the authority picker labels a '
  'candidate by its flat memo falling back to that key and no second, drifting list reader of '
  'clara.accounting_work has to exist; the basis OBJECT is still not projected -- a list of '
  'operations is not a ledger. See this migration''s header and 0189''s for the full rationale.';

-- =====================================================================================
-- §W2 THE SIBLING WIDEN. 0189's clara.get_accounting_work_row body, byte-for-byte, plus the SAME
-- one field in the SAME place — see the header for why the two projections move together.
-- =====================================================================================
create or replace function clara.get_accounting_work_row(p_work uuid) returns jsonb
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
      -- #809: THE SAME ONE FIELD, for the reason this door exists at all. 0189's own comment
      -- calls this "ONE Work in the SAME projection clara.list_accounting_work emits", the
      -- database battery's wl.13 asserts it ("carries the same projection a list row does"), and
      -- apps/web/lib/work/work-list.ts types BOTH doors' answers as one WorkListRow. Widening the
      -- list alone would have made all three false at once and typed a field the addressed row
      -- does not carry as non-nullable. No caller of this door reads it today; it is here so the
      -- two projections cannot drift.
      'intent_key', w.intent_key,
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
  return v_row;end $$;

comment on function clara.get_accounting_work_row(uuid) is
  '#641 B3, widened #809. ONE Work in the SAME projection clara.list_accounting_work emits, '
  'addressed by id alone -- the addressed row a deep link names, which may sit outside any page '
  'the caller has loaded (#719). Same INVOKER posture and same inline bookkeeper floor as the '
  'list, and #809''s intent_key arrives on BOTH or the two projections would have drifted on the '
  'first field either one gained. Another firm''s id, an unreadable one and an absent one all '
  'refuse the SAME CLR11 accounting_work_not_found (no oracle).';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found.
-- =====================================================================================
do $w809_tail$
declare v_src text; v_n int; v_posture text; v_cmt text; v_missing text;
begin
  -- 1 · still EXACTLY ONE body, at the SAME signature. A replace that had somehow created an
  -- overload would leave PostgREST two candidates for one name.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_accounting_work';
  if v_n <> 1 then
    raise exception '#809 tail: clara.list_accounting_work now has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)') is null then
    raise exception '#809 tail: the door''s nine-argument signature no longer resolves' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;

  -- 2 · THE ADDED FIELD, and EXACTLY that one. The projection names intent_key once, from the
  -- column, aliased to itself -- the literal probe this whole file exists for.
  if position('w.intent_key                              as intent_key' in v_src) = 0 then
    raise exception '#809 tail: the committed body does not project w.intent_key as intent_key' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'intent_key', ''))) / length('intent_key');
  if v_n <> 2 then
    raise exception '#809 tail: the committed body mentions intent_key % time(s) (expected exactly 2 -- the column and its alias on the ONE projection line; the #809 comment above it deliberately spells the words apart so this census counts CODE) -- a third is a second, unreviewed use', v_n
      using errcode='CLR10';
  end if;
  -- …and NO basis object joined it. 0189''s own rule, re-measured: the only reads of `basis` are
  -- the flat memo/posting_date/currency projections and the p_q containment filter.
  if position('w.basis                                   as basis' in v_src) <> 0
     or position('to_jsonb(w.basis)' in v_src) <> 0 then
    raise exception '#809 tail: the committed body projects the basis OBJECT -- a list of operations is not a ledger, and #809 is a one-field widen' using errcode='CLR10';
  end if;

  -- 3 · THE THREE CLAUSES A REPLACE RESTATES, plus the two it preserves, in one comparison.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#809 tail: the widened door has the wrong posture -- expected owner clara_fn_owner (UNCHANGED by a replace), SECURITY INVOKER, search_path=clara, pg_temp + plan_cache_mode=force_custom_plan (RESTATED by this file), and EXECUTE to clara_authenticated only (UNCHANGED); got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 4 · the comment, re-issued to describe the row shape that now exists.
  select obj_description(p.oid, 'pg_proc') into v_cmt from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if v_cmt is null or position('#809' in v_cmt) = 0 or position('intent_key' in v_cmt) = 0 then
    raise exception '#809 tail: the widened door''s comment does not name the added field' using errcode='CLR10';
  end if;

  -- 5 · EVERY OTHER ARM SURVIVED, arm by arm, against the committed text.
  v_missing := '';
  if position('role_rank(''bookkeeper'')' in v_src) = 0 then v_missing := v_missing || ' bookkeeper-floor'; end if;
  if position('least(greatest(coalesce(p_limit, 25), 1), 100)' in v_src) = 0 then v_missing := v_missing || ' limit-clamp'; end if;
  if position('array_length(p_status, 1) is null' in v_src) = 0 then v_missing := v_missing || ' empty-array-is-no-filter'; end if;
  if position('invalid_status' in v_src) = 0 then v_missing := v_missing || ' status-roster'; end if;
  if position('invalid_purpose' in v_src) = 0 then v_missing := v_missing || ' purpose-null-refusal'; end if;
  if position('invalid_cursor' in v_src) = 0 then v_missing := v_missing || ' cursor-refusal'; end if;
  if position('non-finite cursor timestamp' in v_src) = 0 then v_missing := v_missing || ' non-finite-cursor-refusal'; end if;
  if position('coalesce(w.initiated_by, w.initiator) = p_initiator' in v_src) = 0 then v_missing := v_missing || ' entered-by-filter'; end if;
  if position('clara._work_run_attempts(v_ids)' in v_src) = 0 then v_missing := v_missing || ' attempts-helper'; end if;
  if position('order by w.created_at desc, w.id desc' in v_src) = 0 then v_missing := v_missing || ' keyset-order'; end if;
  if position('''rows'', v_page, ''next_cursor'', v_next_cursor, ''truncated'', v_truncated' in v_src) = 0 then v_missing := v_missing || ' page-envelope'; end if;
  if v_missing <> '' then
    raise exception '#809 tail: the widen LOST arm(s):% -- only intent_key may arrive', v_missing
      using errcode='CLR10';
  end if;

  -- 6 · THE SIBLING DOOR CARRIES THE SAME FIELD, so "the SAME projection" stays a fact rather
  -- than a comment, and one WorkListRow type can keep describing both. Its own posture is
  -- re-read the same way — a replace restates the three clauses and preserves the other two.
  if to_regprocedure('clara.get_accounting_work_row(uuid)') is null then
    raise exception '#809 tail: clara.get_accounting_work_row no longer resolves' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='get_accounting_work_row';
  if v_n <> 1 then
    raise exception '#809 tail: clara.get_accounting_work_row now has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if position('''intent_key'', w.intent_key' in v_src) = 0 then
    raise exception '#809 tail: the addressed-row door does not project intent_key -- the two projections have drifted on the very first field one of them gained'
      using errcode='CLR10';
  end if;
  if position('accounting_work_not_found' in v_src) = 0 or position('role_rank(''bookkeeper'')' in v_src) = 0 then
    raise exception '#809 tail: the addressed-row widen LOST its no-oracle refusal or its bookkeeper floor' using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#809 tail: the addressed-row door has the wrong posture; got {%}', v_posture
      using errcode='CLR10';
  end if;
  if pg_catalog.has_function_privilege('public', 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)', 'execute') then
    raise exception '#809 tail: PUBLIC regained EXECUTE on the widened door' using errcode='CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)', 'execute') then
    raise exception '#809 tail: clara_authenticated lost EXECUTE on the widened door' using errcode='CLR10';
  end if;

  raise notice '#809 tail: OK -- clara.list_accounting_work exists exactly once at its UNCHANGED nine-argument signature and now projects intent_key straight from the NOT NULL column, once, with no basis object beside it; the body-only replace restated SECURITY INVOKER, search_path=clara, pg_temp and plan_cache_mode=force_custom_plan, and preserved the owner clara_fn_owner and the literal ACL {clara_fn_owner, clara_authenticated} with PUBLIC revoked -- all five re-read from the catalog rather than assumed; the comment is re-issued naming the added field; and every 0189 arm survives -- the inline bookkeeper floor, the 1..100 clamp, empty-array-is-no-filter, the closed status roster and the NULL-purpose refusal, both cursor refusals including the non-finite one, the coalesce(initiated_by, initiator) Entered-by filter, the clara._work_run_attempts page-bounded helper, the (created_at desc, id desc) keyset order and the {rows, next_cursor, truncated} envelope. clara.get_accounting_work_row is widened in the SAME one place with the SAME one field -- 0189 calls it "the SAME projection", work-list.test.mjs wl.13 asserts it and apps/web types both doors as one WorkListRow, so the two projections move together or all three claims become false at once; its owner, SECURITY INVOKER posture, both pins, its ACL, its bookkeeper floor and its no-oracle CLR11 are re-read unchanged.';
end
$w809_tail$;
