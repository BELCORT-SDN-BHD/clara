-- 0266_work_list_claim_label — #880: LABEL A STAFF-EXPENSE CLAIM ON THE WORK LIST, WITHOUT AN
-- N+1 READ.
-- =====================================================================================
-- Spec of record: issue #880's 2026-09-17 Agent Brief (no owner ruling comment dated 2026-09-20
-- exists on this ticket). Domain words: CONTEXT.md — "Accounting work". Precedent this file
-- follows exactly: migration 0203 (#809), which widened these SAME two doors, in the SAME
-- lockstep, for the SAME structural reason ("the two are asserted to move together").
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.list_accounting_work` and
-- `clara.get_accounting_work_row` (0189, last recut by 0203/#809) each gain TWO more projected
-- fields, `claim_id` and `claimant_label`, LEFT JOINED from `clara.staff_expense_claims` by
-- `work_id` — so a claim Work's list row (and its addressed row) carries its own label WITHOUT a
-- second, per-row call to `clara.get_work_claim_origin`.
--
-- =====================================================================================
-- WHY THE ADDITIVE PROJECTION, NOT A BATCHED DOOR — THE BRIEF NAMED BOTH.
--
-- The Agent Brief's "Key interfaces" section named two shapes: "A batched claim-origin read (new
-- door taking a Work id array), or an additive claim projection on `clara.list_accounting_work`
-- and its sibling `get_accounting_work_row` (the two are asserted to move together)." The second
-- is EXACTLY 0203's own shape, already proven safe and already the estate's own precedent for
-- widening this pair — and it costs the browser NOTHING (zero additional round trips, which
-- trivially satisfies AC1's "at most one"), where a batched door would still cost one. A batched
-- door would also have had to re-derive `clara.get_work_claim_origin`'s SECURITY DEFINER
-- firm-scoping for an array of ids, duplicating logic this file's LEFT JOIN gets from the SAME
-- RLS policy the list already leans on for `clara.clients` (`p_staff_expense_claims_read`,
-- 0221: `for select to clara_authenticated using (firm_id = clara.jwt_firm())` — SECURITY
-- INVOKER, exactly like the door itself). `clara.get_work_claim_origin` is UNCHANGED: the Work
-- detail's existing single-Work read (AC3) is untouched by construction, because this file edits
-- neither its body nor any caller of it.
--
-- WHY THE JOIN CANNOT DUPLICATE A ROW. `clara.staff_expense_claims` carries
-- `constraint uq_staff_expense_claims_work unique (work_id)` (0221) — at most one claim per Work,
-- structurally. A LEFT JOIN on `work_id` therefore adds at most one row per Work, never a
-- cardinality change to the page. `sec.firm_id = w.firm_id` is restated explicitly on the join
-- condition — belt-and-braces over the FK that already enforces it
-- (`fk_staff_expense_claims_work foreign key (work_id, firm_id, client_id) references
-- clara.accounting_work(id, firm_id, client_id)`) — matching the SAME explicit-correlation style
-- 0189 already uses for the `clara.clients` join beside it.
--
-- WHY `claim_id`/`claimant_label` AND NOT THE WHOLE `get_work_claim_origin` ENVELOPE. The list is
-- not the detail: #880's own "Out of scope" line is "purpose-specific labels for any OTHER
-- purpose", and 0189's "a list of operations is not a ledger" already refuses money on this
-- projection. Two fields are exactly what the list needs to render "Staff expense claim —
-- <claimant>" instead of "Journal entry"; the settlement, the amounts and the item counts stay on
-- the detail page, read through the UNCHANGED `clara.get_work_claim_origin` exactly as before.
--
-- A BODY-ONLY `CREATE OR REPLACE`, AT THE EXISTING SIGNATURE — for 0203's own stated reason: both
-- doors return a jsonb envelope, so adding a projection field changes nothing about the signature
-- or the return type, and a drop-and-recreate would take the owner/ACL/comment with it for a
-- change that needs none of that moved.
--
-- BUT A REPLACE RESTATES THE WHOLE DEFINITION: `security invoker`,
-- `set search_path = clara, pg_temp`, `set plan_cache_mode = force_custom_plan` are written again
-- below, and §T re-reads all three from pg_proc, together with the owner and the literal ACL,
-- neither of which a replace touches and both of which this file asserts are UNCHANGED.
--
-- 0189 AND 0203 ARE NOT EDITED. §0 sha-pins the LIVE text (measured on this rig now, per house
-- rule — a ticket before this one in the chain may have recut a body this file touches, so the
-- pin is never transcribed from a migration file) and refuses on drift rather than overwriting a
-- body it never read. Measured here: no ticket between 0203 and this file's own prestate touched
-- either function (grep across every migration file for `create or replace function
-- clara.list_accounting_work` / `clara.get_accounting_work_row` returns only 0189 and 0203).
--
-- WHAT DOES NOT CHANGE: the signature, the nine filter axes and their refusals, the keyset
-- contract and its cursor, the two-pass shape, the inline bookkeeper floor, the #809 `intent_key`
-- widen, the SECURITY INVOKER posture, the roster, the grants and the RLS. This is a two-field
-- projection widen and nothing else.
--
-- =====================================================================================
-- AC4 — "IF THE LIST DOOR IS RECUT: THE MIGRATION APPLIES ON A FROM-SCRATCH CHAIN AND THE TWO
-- WORK PROJECTIONS STILL MATCH." This file DOES recut the list door, so AC4 binds: §W2 widens
-- `clara.get_accounting_work_row` in the SAME place with the SAME two fields, and §T's step 6
-- re-reads its committed body to prove the two never drifted, exactly as 0203's own tail did for
-- `intent_key`. `packages/db/tests/work-list.test.mjs` wl.29 proves it again from the OUTSIDE, by
-- calling both doors against one admitted claim.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: THE SAME AS 0189/0203 — a
-- projected column adds none. `claim_id`/`claimant_label` are read, never parsed or validated;
-- their absence (a non-claim Work) is NULL, never a refusal.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $w880_pre$
declare v_src text; v_n int; v_missing text; v_posture text;
begin
  -- 0.1 · the two doors resolve at their existing signatures.
  if to_regprocedure(
      'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'
    ) is null then
    raise exception '#880 prestate: clara.list_accounting_work does not resolve at its nine-argument signature'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.get_accounting_work_row(uuid)') is null then
    raise exception '#880 prestate: clara.get_accounting_work_row does not resolve' using errcode='CLR10';
  end if;

  -- 0.2 · THE RELATION THIS FILE JOINS, and the three columns / one constraint it leans on:
  -- `id`, `work_id`, `claimant_label`, and the UNIQUE on `work_id` that makes the LEFT JOIN
  -- incapable of duplicating a list row.
  if not exists (select 1 from information_schema.tables
      where table_schema='clara' and table_name='staff_expense_claims') then
    raise exception '#880 prestate: clara.staff_expense_claims is absent (migration 0221 has not been applied)'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='staff_expense_claims' and column_name='claimant_label') then
    raise exception '#880 prestate: clara.staff_expense_claims.claimant_label is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname='clara' and t.relname='staff_expense_claims'
        and c.conname='uq_staff_expense_claims_work' and c.contype='u') then
    raise exception '#880 prestate: clara.staff_expense_claims has no UNIQUE constraint named uq_staff_expense_claims_work on work_id -- the LEFT JOIN below would no longer be provably at-most-one-row'
      using errcode='CLR10';
  end if;

  -- 0.3 · EXACTLY ONE body of each name, and it is 0203's -- pinned by prosrc sha-256, MEASURED
  -- on this rig now (never transcribed from a migration file: a ticket before this one in the
  -- chain may have recut a body this file touches).
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_accounting_work';
  if v_n <> 1 then
    raise exception '#880 prestate: clara.list_accounting_work has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if v_src is distinct from '61bd9184fe271e081af426647c4081155c6d086368411478d1f2be88a1f4ca5a' then
    raise exception '#880 prestate: clara.list_accounting_work has DRIFTED from the pinned live body (sha %) -- re-derive section W against the live body before applying', v_src
      using errcode='CLR10';
  end if;

  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='get_accounting_work_row';
  if v_n <> 1 then
    raise exception '#880 prestate: clara.get_accounting_work_row has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if v_src is distinct from '989ee55e52ec724a07fedff6fdf2f4cff22bf60562fe92e249f60dc8c8f801d8' then
    raise exception '#880 prestate: clara.get_accounting_work_row has DRIFTED from the pinned live body (sha %) -- re-derive section W2 against the live body before applying', v_src
      using errcode='CLR10';
  end if;

  -- 0.4 · NEITHER DOOR ALREADY PROJECTS THE CLAIM FIELDS. Stated separately from the sha so a
  -- re-run against an already-widened database says WHY it is refusing.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if position('claim_id' in v_src) <> 0 or position('claimant_label' in v_src) <> 0 then
    raise exception '#880 prestate: the live clara.list_accounting_work ALREADY projects a claim field -- this file has nothing to add and would silently re-write somebody else''s body'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if position('claim_id' in v_src) <> 0 or position('claimant_label' in v_src) <> 0 then
    raise exception '#880 prestate: the live clara.get_accounting_work_row ALREADY projects a claim field' using errcode='CLR10';
  end if;

  -- 0.5 · the arms this file carries over unchanged, named one by one -- 0189's own roster plus
  -- 0203's own #809 widen, which this file must not lose either.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  v_missing := '';
  if position('role_rank(''bookkeeper'')' in v_src) = 0 then v_missing := v_missing || ' bookkeeper-floor'; end if;
  if position('least(greatest(coalesce(p_limit, 25), 1), 100)' in v_src) = 0 then v_missing := v_missing || ' limit-clamp'; end if;
  if position('array_length(p_status, 1) is null' in v_src) = 0 then v_missing := v_missing || ' empty-array-is-no-filter'; end if;
  if position('invalid_status' in v_src) = 0 then v_missing := v_missing || ' status-roster'; end if;
  if position('invalid_purpose' in v_src) = 0 then v_missing := v_missing || ' purpose-null-refusal'; end if;
  if position('non-finite cursor timestamp' in v_src) = 0 then v_missing := v_missing || ' non-finite-cursor-refusal'; end if;
  if position('coalesce(w.initiated_by, w.initiator) = p_initiator' in v_src) = 0 then v_missing := v_missing || ' entered-by-filter'; end if;
  if position('clara._work_run_attempts(v_ids)' in v_src) = 0 then v_missing := v_missing || ' attempts-helper'; end if;
  if position('w.intent_key                              as intent_key' in v_src) = 0 then v_missing := v_missing || ' 809-intent-key-widen'; end if;
  if v_missing <> '' then
    raise exception '#880 prestate: the live clara.list_accounting_work is missing arm(s):%', v_missing
      using errcode='CLR10';
  end if;

  -- 0.6 · the posture a REPLACE preserves (owner, ACL) and the three it restates, for BOTH doors.
  -- Measured here so §T's re-read is a COMPARISON and not a hopeful assertion.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#880 prestate: clara.list_accounting_work does not carry the posture this file must preserve; got {%}', v_posture
      using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#880 prestate: clara.get_accounting_work_row does not carry the posture this file must preserve; got {%}', v_posture
      using errcode='CLR10';
  end if;

  raise notice '#880 prestate: clean -- both doors exist exactly once at their existing signatures, carry the pinned live body byte-for-byte with 0189''s and 0203''s arms intact, do NOT yet project a claim field, and clara.staff_expense_claims exists with claimant_label and a UNIQUE constraint on work_id; both doors are owned by clara_fn_owner, SECURITY INVOKER, search_path- and plan_cache_mode-pinned, PUBLIC-revoked and clara_authenticated-granted.';
end
$w880_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §W THE WIDEN. The pinned live body, byte-for-byte, plus TWO projected fields.
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
        -- #880: THE CLAIM LABEL, when this Work IS one. `clara.staff_expense_claims` carries a
        -- UNIQUE work_id (0221's own constraint), so this LEFT JOIN adds at most one row and can
        -- never duplicate a list row. Both fields are NULL for a plain journal_entry Work, a
        -- periodic_stock_adjustment or a payroll_obligation -- the honest absence, never a
        -- fabricated origin. The settlement, the amounts and the item counts stay off this list
        -- (0189's "a list of operations is not a ledger" stands); a surface that needs them reads
        -- the UNCHANGED clara.get_work_claim_origin, exactly as the Work detail already does.
        sec.id                                    as claim_id,
        sec.claimant_label                        as claimant_label,
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
      -- #880: at most one row (uq_staff_expense_claims_work), so this join cannot duplicate a
      -- list row. sec.firm_id = w.firm_id is belt-and-braces over the FK that already enforces it.
      left join clara.staff_expense_claims sec on sec.work_id = w.id and sec.firm_id = w.firm_id
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
  '#641 B3, widened #809, widened #880. The Work list behind /work (firm-wide) and '
  '/clients/:id/work, and — since #809 — the plan authority picker''s ONE reader of '
  'clara.accounting_work: keyset-paged over (created_at desc, id desc), filterable by '
  'client/status/initiator/purpose/[since,until)/free text, newest first. SECURITY INVOKER over '
  'clara.accounting_work, clara.agent_interruptions, clara.clients and — since #880 — '
  'clara.staff_expense_claims (all four already clara_authenticated-granted with firm-scoped '
  'RLS); refuses CLR04 below bookkeeper before reading. p_status is the closed nine-member '
  'roster, refused CLR10 invalid_status otherwise (a NULL element included); p_purpose''s '
  'VOCABULARY is NOT validated (0178''s CHECK owns it) so an unknown purpose matches nothing, but '
  'a NULL element is refused CLR10 invalid_purpose. p_initiator filters '
  'coalesce(initiated_by, initiator) -- WHO ASKED, the expression the Entered-by column renders -- '
  'not the mutable run authority a Take-over moves. p_q matches the '
  'basis memo by case-insensitive CONTAINMENT, never as a LIKE pattern. p_limit clamps 1..100. '
  'p_cursor is an opaque base64 pair minted by a previous page''s next_cursor; a malformed one '
  'refuses CLR10 invalid_cursor. Every row carries attempts + the pending question id/version so '
  'a caller''s status LABEL is derived from canonical state; no money is projected. #809 added '
  'intent_key, straight from the NOT NULL column. #880 adds TWO more fields, claim_id and '
  'claimant_label, LEFT JOINED from clara.staff_expense_claims by its UNIQUE work_id -- NULL for '
  'any Work that is not a staff expense claim -- so the list can say what a journal_entry-purpose '
  'claim actually is without a second, per-row call to clara.get_work_claim_origin (which stays '
  'the Work detail''s own, unchanged, richer read). The basis OBJECT is still not projected -- a '
  'list of operations is not a ledger. See this migration''s header and 0189''s for the full '
  'rationale.';

-- =====================================================================================
-- §W2 THE SIBLING WIDEN. The pinned live body, byte-for-byte, plus the SAME two fields in the
-- SAME place — see the header for why the two projections move together.
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
      -- #880: THE SAME TWO CLAIM FIELDS, for the SAME reason -- wl.29 (packages/db/tests/
      -- work-list.test.mjs) and this migration's own §T step 6 both re-read this door to prove
      -- it never drifted from the list's own claim projection.
      'claim_id', sec.id, 'claimant_label', sec.claimant_label,
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
    left join clara.staff_expense_claims sec on sec.work_id = w.id and sec.firm_id = w.firm_id
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
  '#641 B3, widened #809, widened #880. ONE Work in the SAME projection '
  'clara.list_accounting_work emits, addressed by id alone -- the addressed row a deep link '
  'names, which may sit outside any page the caller has loaded (#719). Same INVOKER posture and '
  'same inline bookkeeper floor as the list, and #809''s intent_key plus #880''s claim_id/'
  'claimant_label all arrive on BOTH or the two projections would have drifted. Another firm''s '
  'id, an unreadable one and an absent one all refuse the SAME CLR11 accounting_work_not_found '
  '(no oracle).';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found.
-- =====================================================================================
do $w880_tail$
declare v_src text; v_src2 text; v_n int; v_posture text; v_cmt text; v_missing text;
begin
  -- 1 · still EXACTLY ONE body, at the SAME signature, for BOTH doors.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_accounting_work';
  if v_n <> 1 then
    raise exception '#880 tail: clara.list_accounting_work now has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)') is null then
    raise exception '#880 tail: the door''s nine-argument signature no longer resolves' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='get_accounting_work_row';
  if v_n <> 1 then
    raise exception '#880 tail: clara.get_accounting_work_row now has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.get_accounting_work_row(uuid)') is null then
    raise exception '#880 tail: clara.get_accounting_work_row no longer resolves' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;

  -- 2 · THE ADDED FIELDS ON THE LIST DOOR, and EXACTLY that many mentions each. `claim_id`'s
  -- source (`sec.id`) does not itself spell the word, so ONE mention (the alias) is expected;
  -- `claimant_label`'s source IS the word, so its line mentions it TWICE (column and alias) --
  -- the SAME "spell it apart in the comment" discipline 0203 states, applied here too: the
  -- header comment above this projection line says "claim label" and "claimant" in prose, never
  -- the underscored identifiers, so this census counts CODE alone.
  if position('sec.id                                    as claim_id' in v_src) = 0 then
    raise exception '#880 tail: the committed list body does not project sec.id as claim_id' using errcode='CLR10';
  end if;
  if position('sec.claimant_label                        as claimant_label' in v_src) = 0 then
    raise exception '#880 tail: the committed list body does not project sec.claimant_label as claimant_label' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'claim_id', ''))) / length('claim_id');
  if v_n <> 1 then
    raise exception '#880 tail: the committed list body mentions claim_id % time(s) (expected exactly 1 -- the ONE projection alias) -- a second is a second, unreviewed use', v_n
      using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'claimant_label', ''))) / length('claimant_label');
  if v_n <> 2 then
    raise exception '#880 tail: the committed list body mentions claimant_label % time(s) (expected exactly 2 -- the column and its alias on the ONE projection line) -- a third is a second, unreviewed use', v_n
      using errcode='CLR10';
  end if;
  -- …and the JOIN itself, once, correlated on work_id AND firm_id.
  if position('left join clara.staff_expense_claims sec on sec.work_id = w.id and sec.firm_id = w.firm_id' in v_src) = 0 then
    raise exception '#880 tail: the committed list body does not join clara.staff_expense_claims the way this file specifies' using errcode='CLR10';
  end if;

  -- …and NO basis object joined it, and NO other staff_expense_claims column leaked in (the list
  -- stays money-free: 0189's "a list of operations is not a ledger" stands).
  if position('w.basis                                   as basis' in v_src) <> 0
     or position('to_jsonb(w.basis)' in v_src) <> 0 then
    raise exception '#880 tail: the committed body projects the basis OBJECT -- a list of operations is not a ledger' using errcode='CLR10';
  end if;
  if position('sec.amount_cents' in v_src) <> 0 or position('sec.settlement' in v_src) <> 0
     or position('sec.items' in v_src) <> 0 then
    raise exception '#880 tail: the committed body projects a claim MONEY or ITEM field -- #880 is a two-field label widen, not the claim detail' using errcode='CLR10';
  end if;

  -- 3 · THE #809 WIDEN SURVIVED, unmoved, beside the new one.
  if position('w.intent_key                              as intent_key' in v_src) = 0 then
    raise exception '#880 tail: the #809 intent_key widen was lost' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'intent_key', ''))) / length('intent_key');
  if v_n <> 2 then
    raise exception '#880 tail: the committed body mentions intent_key % time(s) (expected exactly 2, unchanged from 0203)', v_n
      using errcode='CLR10';
  end if;

  -- 4 · THE THREE CLAUSES A REPLACE RESTATES, plus the two it preserves, in one comparison.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#880 tail: the widened door has the wrong posture; got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 5 · the comment, re-issued to describe the row shape that now exists.
  select obj_description(p.oid, 'pg_proc') into v_cmt from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if v_cmt is null or position('#880' in v_cmt) = 0 or position('claim_id' in v_cmt) = 0 then
    raise exception '#880 tail: the widened door''s comment does not name the added field' using errcode='CLR10';
  end if;

  -- 6 · EVERY OTHER ARM SURVIVED, arm by arm, against the committed text.
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
    raise exception '#880 tail: the widen LOST arm(s):% -- only claim_id/claimant_label may arrive', v_missing
      using errcode='CLR10';
  end if;

  if pg_catalog.has_function_privilege('public', 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)', 'execute') then
    raise exception '#880 tail: PUBLIC regained EXECUTE on the widened door' using errcode='CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)', 'execute') then
    raise exception '#880 tail: clara_authenticated lost EXECUTE on the widened door' using errcode='CLR10';
  end if;

  -- 7 · THE SIBLING DOOR CARRIES THE SAME TWO FIELDS, so "the SAME projection" stays a fact
  -- rather than a comment, and one WorkListRow type can keep describing both.
  select p.prosrc into v_src2 from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if position('''claim_id'', sec.id, ''claimant_label'', sec.claimant_label' in v_src2) = 0 then
    raise exception '#880 tail: the addressed-row door does not project claim_id/claimant_label the way the list does -- the two projections have drifted'
      using errcode='CLR10';
  end if;
  if position('left join clara.staff_expense_claims sec on sec.work_id = w.id and sec.firm_id = w.firm_id' in v_src2) = 0 then
    raise exception '#880 tail: the addressed-row door does not join clara.staff_expense_claims the way this file specifies' using errcode='CLR10';
  end if;
  if position('''intent_key'', w.intent_key' in v_src2) = 0 then
    raise exception '#880 tail: the addressed-row door lost the #809 intent_key projection' using errcode='CLR10';
  end if;
  if position('accounting_work_not_found' in v_src2) = 0 or position('role_rank(''bookkeeper'')' in v_src2) = 0 then
    raise exception '#880 tail: the addressed-row widen LOST its no-oracle refusal or its bookkeeper floor' using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#880 tail: the addressed-row door has the wrong posture; got {%}', v_posture
      using errcode='CLR10';
  end if;
  select obj_description(p.oid, 'pg_proc') into v_cmt from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if v_cmt is null or position('#880' in v_cmt) = 0 then
    raise exception '#880 tail: the addressed-row door''s comment does not name #880' using errcode='CLR10';
  end if;

  raise notice '#880 tail: OK -- clara.list_accounting_work and clara.get_accounting_work_row both exist exactly once at their UNCHANGED signatures and now project claim_id/claimant_label straight from clara.staff_expense_claims (LEFT JOINED by its UNIQUE work_id, firm-correlated), once each on the list and confirmed identical on the addressed row, with no claim money or item field and no basis object beside them; both bodies restate SECURITY INVOKER, search_path=clara, pg_temp and plan_cache_mode=force_custom_plan, and preserve owner clara_fn_owner and the literal ACL {clara_fn_owner, clara_authenticated} with PUBLIC revoked; both comments are re-issued naming #880; and every prior arm survives on both doors -- the inline bookkeeper floor, the #809 intent_key widen, the 1..100 clamp, empty-array-is-no-filter, the closed status roster and the NULL-purpose refusal, both cursor refusals including the non-finite one, the coalesce(initiated_by, initiator) Entered-by filter, the clara._work_run_attempts page-bounded helper, the (created_at desc, id desc) keyset order, the {rows, next_cursor, truncated} envelope and the addressed row''s own no-oracle CLR11.';
end
$w880_tail$;
