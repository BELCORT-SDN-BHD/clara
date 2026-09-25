-- 0341_work_claim_allocation_count — #1069 (riders sweep wave, lane 03): THE WORK CARD NAMES HOW
-- MANY ADVANCES A CLAIM DISCHARGES.
-- =====================================================================================
-- Spec of record: issue #1069's Agent Brief (no later comment; verified live on this branch,
-- 2026-09-25). Builds on 0221 (`clara.get_work_claim_origin`, the Work-detail claim label) and
-- 0301/#931 (`clara.staff_expense_claim_allocations`, the CONFIRMED per-advance discharge list).
--
-- It recuts EXACTLY ONE body, `clara.get_work_claim_origin(uuid)`, at its 0221 pre-image byte for
-- byte plus ONE new projected key. It creates no relation, drops nothing, grants nothing and mints
-- no new name, so it carries no `rig-meta.mjs` cohort; its frontier is the stem
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
-- THE WEB HALF ships in the same ticket's commits and carries no database object:
-- `apps/web/lib/work/staff-expense-claim-reads.ts`'s `WorkClaimOrigin` type gains
-- `allocation_count: number`, and `apps/web/components/work/work-detail.tsx`'s identity block
-- renders `StaffExpenseClaim.origin.allocationCount` beside the existing claimant/settlement line
-- only when `allocation_count > 1` — a single-advance claim's card is BYTE-IDENTICAL to today's.
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

  -- 0.2 · THE ONE BODY THIS FILE RECUTS. IS THIS A REDO OF THIS VERY FILE? (#957.) The signal is
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

  raise notice '#1069 prestate: clean (% apply) -- the confirmed allocation register (#931/0301) is live with its claim/advance uniqueness intact, the door is % and the two neighbour bodies its new field leans on are unmoved.',
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

  raise notice '#1069 tail OK: clara.get_work_claim_origin projects allocation_count, DRIVEN through the real door and the real read -- 0 for a reimbursement, 1 for a single-advance claim, 2 for a two-advance one, matching the register''s own row count exactly; the rest of the envelope and the two neighbour bodies the new field leans on are unmoved.';
end
$p1069_tail$;
