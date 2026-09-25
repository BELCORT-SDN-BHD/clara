-- 0341_work_claim_allocation_count — #1069 (riders sweep wave, lane 03): THE WORK CARD NAMES HOW
-- MANY ADVANCES A CLAIM DISCHARGES.
-- =====================================================================================
-- Spec of record: issue #1069's Agent Brief (no later comment; verified live on this branch,
-- 2026-09-25). Builds on 0221 (`clara.get_work_claim_origin`, the Work-detail claim label) and
-- 0301/#931 (`clara.staff_expense_claim_allocations`, the CONFIRMED per-advance discharge list).
--
-- It recuts THREE bodies -- `clara.get_work_claim_origin(uuid)` at its 0221 pre-image,
-- `clara.list_accounting_work(...)` at its 0267 pre-image and `clara.get_accounting_work_row(uuid)`
-- at its 0266 pre-image -- each byte for byte plus ONE new projected key, and nothing else (the
-- fix round below says why the two list-surface bodies joined the file). It creates no relation,
-- drops nothing, grants nothing and mints no new name, so it carries no `rig-meta.mjs` cohort;
-- its frontier is the stem
-- `work_claim_allocation_count$` and its sweep escape hatch is
-- `tests/work-claim-allocation-count-preintegration-gate.mjs`
-- (`CLARA_ALLOW_MISSING_WORK_CLAIM_ALLOCATION_COUNT=1`), last in the gate chain, in migration
-- order.
--
-- =====================================================================================
-- WHAT WAS LIVE, MEASURED ON THE LANE DATABASE RATHER THAN READ OFF THE TICKET.
--
-- `clara.get_work_claim_origin` (0221:1679) labels a claim Work's identity block on the Work
-- detail page (`apps/web/components/work/work-detail.tsx`'s `PostedEntrySection`, the
-- `tsec("origin.value", {claimant, settlement})` line, `data-testid="work-claim-origin"`) with the
-- claimant and the settlement kind alone. Since #931 (0301) a single claim can discharge SEVERAL
-- open advances through its own confirmed allocation list
-- (`clara.staff_expense_claim_allocations`), but neither the door nor the line it feeds says so: a
-- claim that discharges one advance and a claim that discharges three render byte-identically.
-- Nothing here was a refusal to fix — it is an absent field, verified absent by reading 0221's
-- live `jsonb_build_object(...)` (measured below) and the web line that consumes it.
--
-- =====================================================================================
-- THE MEASUREMENT: `allocation_count` IS A PLAIN COUNT OF THE REGISTER'S OWN ROWS, NEVER A
-- DEFAULT BRANCH.
--
-- The naive worry is that a claim admitted BEFORE 0301 has no row in
-- `clara.staff_expense_claim_allocations` at all, so the count would read 0 for a real
-- single-advance claim. That worry does not survive reading 0301 itself:
--
--   * 0301 SECTION G backfills, in the SAME migration that creates the table, "every
--     advance-application claim already stored is its own one-element list" — one row per
--     pre-0301 `advance_application` claim, `ordinal = 1`, the claim's own `advance_id` and
--     `amount_cents` (0301:1303-1310). The backfill is unconditional and ran once, at 0301's own
--     apply time; it is not asked again here.
--   * Every claim admitted AFTER 0301 gets its allocation row(s) from
--     `clara.admit_staff_expense_claim_work` SECTION 8a (0301:1067-1075), reached only on the
--     branch that actually inserted the claim, and only when `settlement = 'advance_application'`.
--     `v_allocs` there is `clara._claim_allocations(p_claim)`, whose own header states "a
--     submission carrying only `advance_id` is the ONE-ELEMENT list for the claim's whole amount"
--     — so a legacy-shaped single-advance submission ALSO writes exactly one row, not zero.
--   * #1067 (0339) closed the one gap that could have left an advance-application claim admitted
--     with ZERO rows: a present-but-empty `advance_allocations` array is now refused by name
--     (`advance_allocation_mismatch` / `at_least_one`) before admission, so no LIVE
--     advance-application claim can carry fewer than one allocation row.
--
-- So `select count(*) from clara.staff_expense_claim_allocations where claim_id = sec.id` is EXACT
-- for every claim this door has ever answered for, not only ones admitted after 0301: 1 for a
-- single-advance claim (whether backfilled or freshly admitted), the matching row count for a
-- multi-advance one, and 0 for a claim that discharges no advance at all (`reimbursement`,
-- `already_settled`) — the honest count of an arm that is not there, never a fabricated 1. No
-- `coalesce(...,1)` or settlement branch is needed, and none is written: a branch that is never
-- taken on a healthy database is exactly the kind of "defensive" code this estate's own tests
-- would have nothing to drive (wave-3 addendum: "a data-dependent branch must be entered once").
-- Tail T.2 below DRIVES all three shapes through the real door and the real read to prove it
-- rather than trust the inventory above.
--
-- WHAT THIS FILE DOES NOT TOUCH, AND PINS: `clara._claim_allocations` (the normaliser whose
-- single-advance branch is why a legacy claim's row exists at all) and
-- `clara.admit_staff_expense_claim_work` (SECTION 8a, the writer of every row this count reads).
-- Neither is called by the recut body — `allocation_count` is a bare subquery on the register's
-- own rows — but both are pinned because a future change to either could silently break the
-- INVARIANT this field leans on (every live advance-application claim carries >=1 row) without
-- touching a single byte of `get_work_claim_origin` itself, which is exactly the drift a pin here
-- is for.
--
-- WHAT ELSE DOES NOT MOVE: the signature, the SECURITY DEFINER posture, the pinned search_path,
-- the grant to `clara_authenticated` alone, every other projected key and its value, and the NULL
-- answer for a Work that is not a claim. This is a one-key projection widen and nothing else.
--
-- =====================================================================================
-- FIX ROUND (review finding L03-SPEC-01): THE LIST SURFACE, WHICH IS WHAT THE TICKET ASKED FOR.
--
-- The first cut projected `allocation_count` on `clara.get_work_claim_origin` alone and rendered
-- it on the Work DETAIL view. #1069's AC2 is "The Work LIST card renders that count when it is
-- greater than 1", and its stated value is "giving a reviewer that information WITHOUT OPENING
-- THE CLAIM" -- which a detail-view line cannot deliver. The Work list renders from
-- `clara.list_accounting_work`'s OWN projection (0266 put `claim_id`/`claimant_label` there for
-- exactly this reason, deliberately WITHOUT a second per-row call to the detail read), so the
-- count belongs there too.
--
-- THE ADDRESSED ROW IS NOT OPTIONAL. 0266's own comment on `get_accounting_work_row` states the
-- estate's rule in its own words: the addressed row is "ONE Work in the SAME projection
-- clara.list_accounting_work emits", `packages/db/tests/work-list.test.mjs`'s wl.13 asserts it,
-- and `apps/web/lib/work/work-list.ts` types BOTH doors' answers as one `WorkListRow`. Widening
-- the list alone would have made all three false at once -- and the addressed row is rendered by
-- the SAME component, so a deep-linked claim would have silently lost the count.
--
-- THE LIST'S TWO DOORS ARE SECURITY INVOKER (the detail read is DEFINER), so the new subquery is
-- read by the SIGNED-IN role, not by a definer. That is safe and deliberate:
-- `clara.staff_expense_claim_allocations` is FORCE-RLS, SELECT is granted to clara_authenticated
-- alone, and its one read policy is
-- `p_sec_allocations_read ... for select to clara_authenticated using (firm_id = clara.jwt_firm())`
-- (0301, re-measured on this rig before this file was written) -- so a caller can only ever count
-- allocations of their OWN firm's claims, and the row it hangs off is already firm-scoped by
-- `clara.accounting_work`'s own RLS. A cross-firm row would have been invisible on the list to
-- begin with, and a count that could see across firms would need a policy that does not exist.
--
-- THE WEB HALF ships in the same ticket's commits and carries no database object:
-- `apps/web/lib/work/staff-expense-claim-reads.ts`'s `WorkClaimOrigin` type gains
-- `allocation_count: number`, and `apps/web/components/work/work-detail.tsx`'s identity block
-- renders `StaffExpenseClaim.origin.allocationCount` beside the existing claimant/settlement line
-- only when `allocation_count > 1` — a single-advance claim's card is BYTE-IDENTICAL to today's.
-- The fix round adds the LIST half: `apps/web/lib/work/work-list.ts`'s `WorkListRow` gains
-- `allocation_count: number | null` and `apps/web/components/work/accounting-work-list.tsx`'s
-- `workRowClaimLabel` names the count on the claim label it already renders on every row, again
-- only when it is greater than 1.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- REDO SAFETY (#957). The only statement is a `create or replace function`, and the prestate takes
-- a REDO branch on the marker only this file writes into that body. A redo over this file's own
-- effects is a no-op plus a re-proof. The FIRST-APPLY branch was additionally proved by hand
-- inside a rolled-back transaction (see the ticket report).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $p1069_pre$
declare
  v_sha text; v_src text; v_pin record; v_redo boolean := false;
  -- THE LIVE PRE-IMAGE of the ONE body this file recuts, measured off pg_proc.prosrc on the
  -- lane-03 sweep rig (clara_l06, PG 17, chain 0001..0340) moments before this file was written.
  -- It is 0221's own body: no migration between 0221 and 0340 recuts
  -- `clara.get_work_claim_origin` (grep across every migration file for
  -- `function clara.get_work_claim_origin` returns only 0221's `create function`).
  c_origin_pre constant text :=
    'd2b9f1d1a28136f59dff36870d2926d501e38c35c7726f190ea3bddea02e46f8';
begin
  -- 0.1 · THE REGISTER THIS FILE READS, AND THE ONE CONSTRAINT ITS COUNT LEANS ON: (claim_id,
  -- advance_id) is UNIQUE, so `count(*)` can never double-count one advance as two allocations.
  if to_regclass('clara.staff_expense_claim_allocations') is null then
    raise exception '#1069 prestate: clara.staff_expense_claim_allocations is absent -- 0301 (#931) must apply first'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema = 'clara' and table_name = 'staff_expense_claim_allocations'
        and column_name = 'claim_id') then
    raise exception '#1069 prestate: clara.staff_expense_claim_allocations.claim_id is absent'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint co join pg_class t on t.oid = co.conrelid
      where t.relname = 'staff_expense_claim_allocations'
        and co.conname = 'uq_sec_allocations_claim_advance' and co.contype = 'u') then
    raise exception '#1069 prestate: uq_sec_allocations_claim_advance is absent -- a plain count(*) could double-count one advance'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._claim_allocations(jsonb)') is null then
    raise exception '#1069 prestate: clara._claim_allocations(jsonb) is absent -- 0301 (#931) must apply first'
      using errcode = 'CLR10';
  end if;

  -- 0.2 · THE DETAIL BODY THIS FILE RECUTS. IS THIS A REDO OF THIS VERY FILE? (#957.) The signal is
  -- the marker only this file writes into the recut door.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_work_claim_origin(uuid)'::regprocedure;
  if v_src is null then
    raise exception '#1069 prestate: clara.get_work_claim_origin(uuid) does not resolve -- 0221 must apply first'
      using errcode = 'CLR10';
  end if;
  if position('#1069 (0341' in v_src) > 0 then
    v_redo := true;
    raise notice '#1069 prestate: the door already carries this file''s marker -- treating this as a #957 REDO of 0341 itself. The single statement below is a create-or-replace and is redo-safe by construction; the tail re-proves the whole post-state.';
  end if;
  if not v_redo then
    select encode(sha256(convert_to(v_src, 'UTF8')), 'hex') into v_sha;
    if v_sha <> c_origin_pre then
      raise exception '#1069 prestate: clara.get_work_claim_origin(uuid) has DRIFTED from its pinned 0221 pre-image (measured %, expected %) -- no ticket between 0221 and this file recuts it, so re-derive against the LIVE body before applying', v_sha, c_origin_pre
        using errcode = 'CLR10';
    end if;
  end if;

  -- 0.2b · THE TWO LIST-SURFACE BODIES THIS FILE ALSO RECUTS (fix round, L03-SPEC-01), each
  -- with its OWN redo branch on the SAME marker, so a redo of this file over its own effects is a
  -- no-op plus a re-proof while a FIRST apply is held to the measured pre-image.
  --
  -- `clara.list_accounting_work` was last cut by 0267 (#905) and `clara.get_accounting_work_row`
  -- by 0266 (#880); no migration between those files and 0340 recuts either (grep across every
  -- migration for `function clara.list_accounting_work` returns 0189/0203/0266/0267 and for
  -- `function clara.get_accounting_work_row` returns 0189/0203/0266). Both shas below were
  -- MEASURED on the lane-03 sweep rig (clara_l06, chain 0001..0341) immediately before this
  -- section was written, and each source statement's own text was diffed byte for byte against
  -- the live `prosrc` to confirm the copy below is its pre-image and not a re-typing of it.
  for v_pin in select * from (values
      ('clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)',
       'dffa917db2180f5a13be48795ea823ef5cece813677d8d6ad6c61cf01726a828'),
      ('clara.get_accounting_work_row(uuid)',
       '9979520fe0202141686d960c8dfa4ae8efd3ffb31f14aae787074218fbce0781')) as t(sig, sha) loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_src is null then
      raise exception '#1069 prestate: % does not resolve -- 0266/0267 must apply first', v_pin.sig
        using errcode = 'CLR10';
    end if;
    if position('#1069 (0341' in v_src) > 0 then
      raise notice '#1069 prestate: % already carries this file''s marker -- REDO branch.', v_pin.sig;
    else
      select encode(sha256(convert_to(v_src, 'UTF8')), 'hex') into v_sha;
      if v_sha <> v_pin.sha then
        raise exception '#1069 prestate: % has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive against the LIVE body before applying', v_pin.sig, v_sha, v_pin.sha
          using errcode = 'CLR10';
      end if;
    end if;
  end loop;

  -- 0.3 · NON-REGRESSION, pinned and NOT recut by this file: the two bodies the register's own
  -- INVARIANT (every live advance-application claim carries >=1 allocation row) depends on. See
  -- this file's own header for why a pin here, and not a call from the recut body, is the right
  -- shape.
  for v_pin in select * from (values
      ('clara._claim_allocations(jsonb)',
       'c303577a5c35d9f7c788edc4acded82fa64e7db414d4ee10a61a979ffa34b737'),
      ('clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)',
       '8ca64d40ff92d6dbc61f53d13269c5a80de39e892bedf5c6da54fd7827089ed2')) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#1069 prestate: % MOVED (measured %, expected %) -- this file recuts exactly ONE body and nothing else', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1069 prestate: clean (% apply) -- the confirmed allocation register (#931/0301) is live with its claim/advance uniqueness intact, the detail read is %, the two LIST-surface doors are at their measured 0266/0267 pre-images (or already carry this file''s marker), and the two neighbour bodies the new field leans on are unmoved.',
    case when v_redo then 'REDO' else 'FIRST' end,
    case when v_redo then 'at its own post-image' else 'at its measured 0221 body' end;
end
$p1069_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- THE RECUT DOOR. 0221's body, byte for byte, plus ONE new projected key.
-- =====================================================================================
create or replace function clara.get_work_claim_origin(p_work uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_out jsonb;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  select jsonb_build_object(
      'claim_id', sec.id, 'settlement', sec.settlement,
      'claimant_enrolment_id', sec.claimant_enrolment_id, 'claimant_label', sec.claimant_label,
      'amount_cents', sec.amount_cents, 'currency', sec.currency,
      'incurred_date', to_char(sec.incurred_date,'YYYY-MM-DD'),
      'posting_date', to_char(sec.posting_date,'YYYY-MM-DD'),
      'item_count', jsonb_array_length(sec.items),
      'pending_item_count', (select count(*)::int from jsonb_array_elements(sec.items) i(e)
                              where nullif(btrim(coalesce(i.e->>'pending_fact','')),'') is not null),
      'corrects_claim_id', sec.corrects_claim_id,
      'corrected_by_claim_id', sec.corrected_by_claim_id,
      -- #1069 (0341): HOW MANY ADVANCES this claim discharges, read from the register's own
      -- CONFIRMED list (clara.staff_expense_claim_allocations, #931/0301) rather than re-derived
      -- from the claim's stored basis or re-parsed out of its jsonb. This is a bare count of that
      -- register's own rows, EXACT for every claim this door has ever answered for (this file's
      -- own header says why no default branch is needed): 1 for a single-advance claim, the
      -- matching row count for a multi-advance one, and 0 for a claim that discharges no advance
      -- at all (reimbursement, already_settled) -- the honest count of an arm that is not there.
      'allocation_count', (select count(*)::int from clara.staff_expense_claim_allocations al
                             where al.claim_id = sec.id))
    into v_out
    from clara.staff_expense_claims sec
   where sec.work_id = p_work and sec.firm_id = v_firm;
  return v_out;
end $$;
revoke all on function clara.get_work_claim_origin(uuid) from public;
grant execute on function clara.get_work_claim_origin(uuid) to clara_authenticated;
comment on function clara.get_work_claim_origin(uuid) is
  '#638 (+#1069): the claim a `journal_entry` Work carries, or NULL. Lets the Work list and Work '
  'detail label a staff expense claim WITHOUT a purpose value -- the purpose vocabulary is '
  'deliberately unwidened (see 0221''s header) -- and now carries `allocation_count`, how many '
  'advances the claim''s advance-application arm discharges, read from '
  'clara.staff_expense_claim_allocations rather than re-derived. Viewer+, firm-scoped.';

-- =====================================================================================
-- THE TWO LIST-SURFACE DOORS (fix round, L03-SPEC-01). 0267's and 0266's bodies, byte for byte,
-- each plus the SAME one projected key. Both stay SECURITY INVOKER with their own pinned
-- search_path and plan_cache_mode, and neither is dropped, so their ACLs and comments survive.
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
  p_limit     int         default 25,
  -- #905: THE RECEIPT-DATED BOUND, LAST so every existing positional caller keeps its meaning and
  -- an omitted pair reproduces the nine-argument door exactly — same rows, same order, same
  -- cursors, for every other caller in the estate (AC3's "supplying neither returns today's
  -- result").
  p_receipt_since timestamptz default null,
  p_receipt_until timestamptz default null
) returns jsonb
  language plpgsql stable security invoker
  -- RE-ISSUED, NOT INHERITED. A DROP took both of these with it; a `create or replace` alone
  -- (had one been legal here) would have preserved them. See this file's header for the full list
  -- of five properties a drop destroys.
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
        -- #905: THE COMMITTED RECEIPT, joined so a receipt-dated bound can fence w.id without a
        -- second round trip. AT MOST ONE ROW: uq_operation_receipts_committed (0178:448) admits at
        -- most one committed receipt per (firm_id, logical_op_id), and 0214's own header records
        -- that a Work carries exactly one logical identity -- but this file does not lean on that
        -- alone (0214 itself only calls it a "belt"): a LATERAL with `limit 1`, the SAME "at most
        -- one" idiom the pending-question join below already uses, so even a violation of that
        -- invariant could never duplicate a list row.
        left join lateral (
          select o.created_at as committed_at
            from clara.operation_receipts o
           where o.work_id = w.id and o.firm_id = w.firm_id and o.outcome = 'committed'
           order by o.created_at desc
           limit 1
        ) rc on true
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
         -- #905: THE RECEIPT-DATED BOUND. `rc.committed_at` is NULL for a Work with no committed
         -- receipt, and a NULL compared against a receipt bound is NULL -- neither true nor false
         -- -- so supplying EITHER argument excludes an undated completion rather than dating it by
         -- something else (the Agent Brief's own second line). Supplying NEITHER leaves both arms
         -- `true` regardless of `rc.committed_at`, so an omitted pair reproduces today's page
         -- exactly (AC3), and this pair composes with p_since/p_until above by plain `and` (AC3's
         -- "both bounds combine").
         and (p_receipt_since is null or rc.committed_at >= p_receipt_since)
         and (p_receipt_until is null or rc.committed_at < p_receipt_until)
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
  -- from an order the aggregate itself did not pin (0181's own measured note). UNCHANGED from
  -- 0266, character for character -- #905 is a FILTER widen, and pass 2's own row shape is not
  -- one of the things a filter can touch.
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
        -- #1069 (0341): HOW MANY ADVANCES this claim discharges, so a reviewer can see that a
        -- claim settles more than one WITHOUT OPENING IT (#1069's own words). Read from the
        -- register's own CONFIRMED list (clara.staff_expense_claim_allocations, #931/0301), never
        -- re-derived from the claim's stored basis: a bare count over rows keyed
        -- (claim_id, advance_id) UNIQUE, so one advance can never count as two. NULL -- not 0 --
        -- for a Work that is not a claim at all, the same honest absence claim_id and
        -- claimant_label already carry; 0 for a claim that discharges no advance (reimbursement,
        -- already_settled); 1 for a single-advance claim, whether backfilled by 0301 SECTION G or
        -- freshly admitted. This file's own header says why no coalesce branch is needed.
        --
        -- IT IS A SUBQUERY ON THE LIST'S OWN ROW, NOT A SECOND DOOR CALL. clara.get_work_claim_origin
        -- stays the Work DETAIL's richer read; a per-row call to it from the list would be one
        -- round trip per row, which is exactly what 0266 refused when it projected claim_id here.
        (case when sec.id is null then null else
          (select count(*)::int from clara.staff_expense_claim_allocations al
            where al.claim_id = sec.id) end)        as allocation_count,
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

comment on function clara.list_accounting_work(
  uuid, text[], uuid, text[], timestamptz, timestamptz, text, text, int, timestamptz, timestamptz
) is
  '#641 B3, widened #809 (intent_key), #880 (claim_id/claimant_label), #905 (p_receipt_since/'
  'p_receipt_until) and #1069 (allocation_count). The Work list page: one page of accounting Work '
  'in (created_at desc, id desc) keyset order, firm-scoped by RLS under the caller''s own role, '
  'with an inline bookkeeper floor. allocation_count is how many advances a staff expense claim '
  'discharges, read from clara.staff_expense_claim_allocations -- NULL for a Work that is not a '
  'claim, so the list card can say "settles N advances" without opening the claim.';

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
      -- #1069 (0341): THE SAME ONE FIELD, for the reason #809 and #880 give above -- 0189's
      -- "ONE Work in the SAME projection clara.list_accounting_work emits", wl.13's assertion of
      -- it, and apps/web/lib/work/work-list.ts typing BOTH doors' answers as one WorkListRow.
      -- Widening the list alone would have made all three false and left the ADDRESSED row (the
      -- one a deep link names, rendered by the same component) silently missing the count.
      'allocation_count', (case when sec.id is null then null else
        (select count(*)::int from clara.staff_expense_claim_allocations al
          where al.claim_id = sec.id) end),
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
  '#641 B3, widened #809, #880 and #1069. ONE Work in the SAME projection '
  'clara.list_accounting_work emits, addressed by id alone -- the addressed row a deep link '
  'names, which may sit outside any page the caller has loaded (#719). Same INVOKER posture and '
  'same inline bookkeeper floor as the list, and #809''s intent_key, #880''s claim_id/'
  'claimant_label and #1069''s allocation_count all arrive on BOTH or the two projections would '
  'have drifted. Another firm''s id, an unreadable one and an absent one all refuse the SAME '
  'CLR11 accounting_work_not_found (no oracle).';

reset role;

-- =====================================================================================
-- THE TAIL. The rule is DRIVEN here, not described: a real client, a real enrolment, three real
-- advances and three real claims (reimbursement, single-advance, multi-advance), admitted through
-- the REAL door (`clara.admit_staff_expense_claim_work` takes its author as an explicit argument,
-- not from a JWT, so it is callable directly) and read back through the REAL recut door under a
-- faked JWT (`clara._human_ctx` reads `request.jwt.claims`, exactly the GUC PostgREST would set).
-- Fixtures are hand-written (every NOT NULL column, CHECK and foreign key the live catalog
-- carries, measured on this rig before this file was written) and unwound inside a CLR99
-- sub-transaction (the 0018 / 0019 / 0020 / 0146 / 0260 / 0302 / 0340 probe idiom).
-- =====================================================================================
do $p1069_tail$
declare
  v_n int; v_sha text; v_src text; v_pin record;
  v_user uuid; v_firm uuid; v_client uuid; v_entry uuid; v_enrol uuid;
  v_line1 uuid; v_line2 uuid; v_line3 uuid;
  v_adv1 uuid; v_adv2 uuid; v_adv3 uuid;
  v_claim_a jsonb; v_claim_b jsonb; v_claim_c jsonb;
  v_res_a jsonb; v_res_b jsonb; v_res_c jsonb;
  v_origin_a jsonb; v_origin_b jsonb; v_origin_c jsonb;
  v_page jsonb; v_row jsonb; v_addressed jsonb;
begin
  -- T.1 THE RECUT DOOR keeps its owner, its definer flag, its pinned search_path, its grant matrix
  -- and its marker.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.get_work_claim_origin(uuid)'::regprocedure
     and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#1069 tail T.1: the door lost its owner, its SECURITY DEFINER flag or its pinned search_path'
      using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara.get_work_claim_origin(uuid)', 'EXECUTE') then
    raise exception '#1069 tail T.1b: PUBLIC holds EXECUTE on the door' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', 'clara.get_work_claim_origin(uuid)', 'EXECUTE') then
    raise exception '#1069 tail T.1c: clara_authenticated cannot execute the door' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime', 'clara.get_work_claim_origin(uuid)', 'EXECUTE')
     or has_function_privilege('clara_agent_ro', 'clara.get_work_claim_origin(uuid)', 'EXECUTE') then
    raise exception '#1069 tail T.1d: the door is granted beyond clara_authenticated' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_work_claim_origin(uuid)'::regprocedure;
  if position('#1069 (0341' in coalesce(v_src,'')) = 0 then
    raise exception '#1069 tail T.1e: the door does not carry this file''s marker' using errcode='CLR10';
  end if;
  if position('allocation_count' in coalesce(v_src,'')) = 0 then
    raise exception '#1069 tail T.1f: the door does not project allocation_count' using errcode='CLR10';
  end if;

  -- T.1g THE TWO LIST-SURFACE DOORS (fix round, L03-SPEC-01) keep the posture 0266/0267 gave
  -- them -- owner, SECURITY INVOKER (NOT definer: the count is read by the signed-in role, under
  -- the register's own firm-scoped RLS policy), both pinned settings -- and each exists exactly
  -- once at its unchanged signature.
  for v_pin in select * from (values
      ('clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)'),
      ('clara.get_accounting_work_row(uuid)')) as t(sig) loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_pin.sig::regprocedure
       and p.proowner::regrole::text = 'clara_fn_owner' and not p.prosecdef
       and 'search_path=clara, pg_temp' = any(p.proconfig)
       and 'plan_cache_mode=force_custom_plan' = any(p.proconfig);
    if v_n <> 1 then
      raise exception '#1069 tail T.1g: % lost its owner, its SECURITY INVOKER posture or one of its pinned settings', v_pin.sig
        using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_pin.sig, 'EXECUTE') then
      raise exception '#1069 tail T.1g: PUBLIC holds EXECUTE on %', v_pin.sig using errcode='CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', v_pin.sig, 'EXECUTE') then
      raise exception '#1069 tail T.1g: clara_authenticated cannot execute %', v_pin.sig using errcode='CLR10';
    end if;
    if has_function_privilege('clara_runtime', v_pin.sig, 'EXECUTE')
       or has_function_privilege('clara_agent_ro', v_pin.sig, 'EXECUTE') then
      raise exception '#1069 tail T.1g: % is granted beyond clara_authenticated', v_pin.sig using errcode='CLR10';
    end if;
    select p.prosrc into v_src from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if position('#1069 (0341' in coalesce(v_src,'')) = 0
       or position('as allocation_count' in coalesce(v_src,'')) + position('''allocation_count''' in coalesce(v_src,'')) = 0 then
      raise exception '#1069 tail T.1h: % does not carry this file''''s marker and its allocation_count projection', v_pin.sig
        using errcode='CLR10';
    end if;
    -- …AND EXACTLY ONE new count subquery: a second, unreviewed use would be a second answer.
    v_n := (length(v_src) - length(replace(v_src, 'from clara.staff_expense_claim_allocations al', '')))
             / length('from clara.staff_expense_claim_allocations al');
    if v_n <> 1 then
      raise exception '#1069 tail T.1h: % READS clara.staff_expense_claim_allocations % time(s) (expected exactly 1 -- the ONE projected count; the prose above it names the register too, which is why this counts the FROM clause and not the word)', v_pin.sig, v_n
        using errcode='CLR10';
    end if;
    -- …and every arm 0266/0267 shipped is still there, spot-checked on the two fields the widen
    -- sits beside and on the envelope the list answers with.
    if position('claimant_label' in v_src) = 0 then
      raise exception '#1069 tail T.1h: % lost the #880 claimant_label projection', v_pin.sig using errcode='CLR10';
    end if;
  end loop;
  if position('jsonb_build_object(''rows'', v_page, ''next_cursor'', v_next_cursor, ''truncated'', v_truncated)'
      in (select p.prosrc from pg_proc p
           where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)'::regprocedure)) = 0 then
    raise exception '#1069 tail T.1h: the list door lost its {rows, next_cursor, truncated} envelope'
      using errcode='CLR10';
  end if;

  -- T.2 THE THREE SHAPES, DRIVEN against real rows through the real door and the real read.
  begin
    v_user := gen_random_uuid();
    insert into clara.users(id, display_name) values (v_user, '1069-allocation-count probe');
    insert into clara.firms(id, name) values (gen_random_uuid(), '1069-allocation-count probe firm')
      returning id into v_firm;
    insert into clara.firm_memberships(firm_id, user_id, role, status)
      values (v_firm, v_user, 'admin', 'active');
    insert into clara.clients(firm_id, name, status)
      values (v_firm, '1069-allocation-count probe client', 'active')
      returning id into v_client;
    insert into clara.coa_accounts(firm_id, client_id, account_code, name, account_type)
      values (v_firm, v_client, '6200', 'Travel (probe)', 'expense'),
             (v_firm, v_client, '2010', 'Other Payables (probe)', 'liability'),
             (v_firm, v_client, '1150', 'Bank (probe)', 'asset'),
             (v_firm, v_client, '1190', 'Staff advance (probe)', 'asset');

    -- ONE claimant, faked JWT for the admin-floored enrolment door and, later, for the
    -- viewer-floored read -- both go through clara._human_ctx, which reads request.jwt.claims.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user)::text, true);
    perform clara.enrol_staff_advance_account(v_client, '1190', '1069 Probe Claimant', true,
      '1069 probe: dedicated to one named person', '1069-probe-enrol');
    select id into v_enrol from clara.staff_advance_accounts
     where client_id = v_client and account_code = '1190' and active;

    -- THREE advances, all issued to that ONE enrolment (arm (a): the advance's own enrolment IS
    -- the claimant's -- no label-matching arm needed for this probe).
    insert into clara.journal_entries(id, firm_id, client_id, status, posting_date, memo, origin,
        maker_actor)
      values (gen_random_uuid(), v_firm, v_client, 'draft', date '2026-01-10',
        '1069 probe advance disbursements', 'agent', v_user)
      returning id into v_entry;
    insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code,
        debit_cents, credit_cents)
      values (v_entry, 1, v_client, v_firm, '1190', 20000, 0) returning id into v_line1;
    insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code,
        debit_cents, credit_cents)
      values (v_entry, 2, v_client, v_firm, '1190', 20000, 0) returning id into v_line2;
    insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code,
        debit_cents, credit_cents)
      values (v_entry, 3, v_client, v_firm, '1190', 15000, 0) returning id into v_line3;
    insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code,
        debit_cents, credit_cents)
      values (v_entry, 4, v_client, v_firm, '1150', 0, 55000);
    insert into clara.staff_advances(firm_id, client_id, enrolment_id, account_code,
        disbursement_line_id, entry_id, issue_date, amount_cents)
      values (v_firm, v_client, v_enrol, '1190', v_line1, v_entry, date '2026-01-10', 20000)
      returning id into v_adv1;
    insert into clara.staff_advances(firm_id, client_id, enrolment_id, account_code,
        disbursement_line_id, entry_id, issue_date, amount_cents)
      values (v_firm, v_client, v_enrol, '1190', v_line2, v_entry, date '2026-01-10', 20000)
      returning id into v_adv2;
    insert into clara.staff_advances(firm_id, client_id, enrolment_id, account_code,
        disbursement_line_id, entry_id, issue_date, amount_cents)
      values (v_firm, v_client, v_enrol, '1190', v_line3, v_entry, date '2026-01-10', 15000)
      returning id into v_adv3;

    -- (a) REIMBURSEMENT — discharges no advance at all.
    v_claim_a := jsonb_build_object(
      'claimant', jsonb_build_object('enrolment_id', v_enrol),
      'source_kind', 'instruction', 'instruction', '1069 probe: reimbursement',
      'incurred_date', '2026-03-04', 'posting_date', '2026-03-31',
      'currency', 'MYR', 'amount_cents', 8000,
      'items', jsonb_build_array(jsonb_build_object('description', '1069 probe reimbursement',
        'expense_account_code', '6200', 'amount_cents', 8000)),
      'settlement', 'reimbursement', 'payable_account_code', '2010');
    select clara.admit_staff_expense_claim_work(v_client, v_user, '1069-probe-claim-a',
      v_claim_a, 'user_direct', '[]'::jsonb, '1069-probe-model') into v_res_a;

    -- (b) SINGLE-ADVANCE application — the legacy shape, `advance_id` and no
    -- `advance_allocations` key. `clara._claim_allocations` falls through to its own one-element
    -- list, and #931's door writes exactly that one row (0301:1067-1075).
    v_claim_b := jsonb_build_object(
      'claimant', jsonb_build_object('enrolment_id', v_enrol),
      'source_kind', 'instruction', 'instruction', '1069 probe: single advance',
      'incurred_date', '2026-03-04', 'posting_date', '2026-03-31',
      'currency', 'MYR', 'amount_cents', 12000,
      'items', jsonb_build_array(jsonb_build_object('description', '1069 probe single advance',
        'expense_account_code', '6200', 'amount_cents', 12000)),
      'settlement', 'advance_application', 'advance_account_code', '1190', 'advance_id', v_adv1);
    select clara.admit_staff_expense_claim_work(v_client, v_user, '1069-probe-claim-b',
      v_claim_b, 'user_direct', '[]'::jsonb, '1069-probe-model') into v_res_b;

    -- (c) MULTI-ADVANCE application — an explicit two-element `advance_allocations` list
    -- (#931/0301), against the OTHER two advances.
    v_claim_c := jsonb_build_object(
      'claimant', jsonb_build_object('enrolment_id', v_enrol),
      'source_kind', 'instruction', 'instruction', '1069 probe: multi advance',
      'incurred_date', '2026-03-04', 'posting_date', '2026-03-31',
      'currency', 'MYR', 'amount_cents', 15000,
      'items', jsonb_build_array(jsonb_build_object('description', '1069 probe multi advance',
        'expense_account_code', '6200', 'amount_cents', 15000)),
      'settlement', 'advance_application', 'advance_account_code', '1190',
      'advance_allocations', jsonb_build_array(
        jsonb_build_object('advance_id', v_adv2, 'amount_cents', 9000, 'account_code', '1190'),
        jsonb_build_object('advance_id', v_adv3, 'amount_cents', 6000, 'account_code', '1190')));
    select clara.admit_staff_expense_claim_work(v_client, v_user, '1069-probe-claim-c',
      v_claim_c, 'user_direct', '[]'::jsonb, '1069-probe-model') into v_res_c;

    -- THE READ, through the RECUT door, under the SAME faked JWT (viewer rank suffices; this
    -- probe's user is enrolled at admin, well above it).
    select clara.get_work_claim_origin((v_res_a->>'work_id')::uuid) into v_origin_a;
    select clara.get_work_claim_origin((v_res_b->>'work_id')::uuid) into v_origin_b;
    select clara.get_work_claim_origin((v_res_c->>'work_id')::uuid) into v_origin_c;
    perform set_config('request.jwt.claims', '', true);

    if v_origin_a is null or v_origin_b is null or v_origin_c is null then
      raise exception '#1069 tail T.2: the recut door answered NULL for a claim Work it should have labelled'
        using errcode='CLR10';
    end if;
    if (v_origin_a->>'allocation_count')::int <> 0 then
      raise exception '#1069 tail T.2a: a reimbursement claim''s allocation_count is % (expected 0 -- it discharges no advance at all)', v_origin_a->>'allocation_count'
        using errcode='CLR10';
    end if;
    if (v_origin_b->>'allocation_count')::int <> 1 then
      raise exception '#1069 tail T.2b: a single-advance claim''s allocation_count is % (expected 1)', v_origin_b->>'allocation_count'
        using errcode='CLR10';
    end if;
    if (v_origin_c->>'allocation_count')::int <> 2 then
      raise exception '#1069 tail T.2c: a two-advance claim''s allocation_count is % (expected 2, matching its row count)', v_origin_c->>'allocation_count'
        using errcode='CLR10';
    end if;
    -- AND THE REST OF THE ENVELOPE IS UNTOUCHED -- a light check that the read is truly hitting
    -- the row this probe wrote, not a coincidence of the count alone.
    if v_origin_c->>'settlement' <> 'advance_application'
       or v_origin_c->>'claimant_label' <> '1069 Probe Claimant'
       or (v_origin_c->>'amount_cents')::int <> 15000 then
      raise exception '#1069 tail T.2d: the multi-advance claim''s other fields moved (%)', v_origin_c
        using errcode='CLR10';
    end if;
    -- AND THE REGISTER'S OWN ROW COUNT AGREES WITH WHAT THE DOOR ANSWERED, read directly.
    select count(*)::int into v_n from clara.staff_expense_claim_allocations
     where claim_id = (v_res_c->>'claim_id')::uuid;
    if v_n <> 2 then
      raise exception '#1069 tail T.2e: the register itself carries % rows for the multi-advance claim (expected 2)', v_n
        using errcode='CLR10';
    end if;

    -- T.2f THE LIST SURFACE, DRIVEN -- the half the fix round exists for. Both list doors are
    -- SECURITY INVOKER, so the only honest way to read them is AS THE SIGNED-IN ROLE: the probe
    -- becomes clara_authenticated under the same faked JWT, which is also what makes the new
    -- count subquery answer through clara.staff_expense_claim_allocations' own firm-scoped RLS
    -- policy rather than around it.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user)::text, true);
    perform set_config('role', 'clara_authenticated', true);
    select clara.list_accounting_work(p_client => v_client, p_limit => 25) into v_page;
    select clara.get_accounting_work_row((v_res_c->>'work_id')::uuid) into v_addressed;
    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claims', '', true);

    if jsonb_array_length(v_page->'rows') <> 3 then
      raise exception '#1069 tail T.2f: the list answered % row(s) for the probe client (expected the 3 claims it admitted)', jsonb_array_length(v_page->'rows')
        using errcode='CLR10';
    end if;
    if exists (select 1 from jsonb_array_elements(v_page->'rows') e(elem)
                where not (e.elem ? 'allocation_count')) then
      raise exception '#1069 tail T.2f: a list row arrived WITHOUT the allocation_count key -- the projection must be on every row, present-and-null or not at all'
        using errcode='CLR10';
    end if;
    select e.elem into v_row from jsonb_array_elements(v_page->'rows') e(elem)
     where e.elem->>'id' = v_res_a->>'work_id';
    if (v_row->>'allocation_count')::int <> 0 then
      raise exception '#1069 tail T.2f: the reimbursement claim''s LIST row says % (expected 0)', v_row->>'allocation_count'
        using errcode='CLR10';
    end if;
    select e.elem into v_row from jsonb_array_elements(v_page->'rows') e(elem)
     where e.elem->>'id' = v_res_b->>'work_id';
    if (v_row->>'allocation_count')::int <> 1 then
      raise exception '#1069 tail T.2f: the single-advance claim''s LIST row says % (expected 1)', v_row->>'allocation_count'
        using errcode='CLR10';
    end if;
    select e.elem into v_row from jsonb_array_elements(v_page->'rows') e(elem)
     where e.elem->>'id' = v_res_c->>'work_id';
    if (v_row->>'allocation_count')::int <> 2 then
      raise exception '#1069 tail T.2f: the two-advance claim''s LIST row says % (expected 2)', v_row->>'allocation_count'
        using errcode='CLR10';
    end if;
    if v_row->>'claim_id' is distinct from v_res_c->>'claim_id'
       or v_row->>'claimant_label' <> '1069 Probe Claimant' then
      raise exception '#1069 tail T.2f: the list row''s #880 fields moved (%)', v_row using errcode='CLR10';
    end if;

    -- …AND THE ADDRESSED ROW ANSWERS THE SAME, because the two projections are one projection.
    if (v_addressed->>'allocation_count')::int <> 2
       or v_addressed->>'id' is distinct from v_res_c->>'work_id' then
      raise exception '#1069 tail T.2g: the ADDRESSED row disagrees with the list row (%)', v_addressed
        using errcode='CLR10';
    end if;

    -- Force the subtransaction to unwind so no fixture row (and no local GUC change) survives
    -- this migration's own commit.
    raise exception 'clara_1069_probe_rollback' using errcode='CLR99';
  exception
    when sqlstate 'CLR99' then null; -- expected: fixtures discarded
  end;

  -- T.3 THE TWO NEIGHBOUR BODIES THIS FILE DOES NOT TOUCH, re-measured AFTER the recut.
  for v_pin in select * from (values
      ('clara._claim_allocations(jsonb)',
       'c303577a5c35d9f7c788edc4acded82fa64e7db414d4ee10a61a979ffa34b737'),
      ('clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)',
       '8ca64d40ff92d6dbc61f53d13269c5a80de39e892bedf5c6da54fd7827089ed2')) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#1069 tail T.3: % MOVED during this migration (measured %, expected %)', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#1069 tail OK: clara.get_work_claim_origin, clara.list_accounting_work and clara.get_accounting_work_row all project allocation_count, DRIVEN through the real admission door and all three real reads -- 0 for a reimbursement, 1 for a single-advance claim, 2 for a two-advance one, matching the register''s own row count exactly, with the two INVOKER list doors read AS clara_authenticated under the register''s own firm-scoped RLS; the rest of each envelope, both doors'' posture and ACLs, and the two neighbour bodies the new field leans on are unmoved.';
end
$p1069_tail$;
