-- 0301_staff_expense_claim_allocations — #931 (parent #881, owner ruling 2026-09-18): ONE STAFF
-- EXPENSE CLAIM DISCHARGES SEVERAL OPEN ADVANCES THROUGH AN EXPLICIT ALLOCATION LIST.
-- =====================================================================================
-- Spec of record: issue #931 and its parent #881's owner ruling of 2026-09-18 — "a staff expense
-- claim may discharge several open advances through an explicit allocation list, with a one-click
-- date-ordered suggestion; the stored record is always the confirmed list, so WD-R10's 'no silent
-- FIFO' stands". Builds on 0043 (the staff-advance register, its enrolment reader and its ONE
-- temporal over-application cap) and 0221 (the claim, its door, its birth trigger and its reads).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A NEW append-only child relation
-- `clara.staff_expense_claim_allocations` (advance, amount, ordinal) plus ONE new pure derivation
-- `clara._claim_allocations`, and it RECUTS the eight 0221 bodies that have to read a LIST where
-- they used to read one advance — so a claim can settle against two advances without one byte of
-- the posting core, the belt, the shared cap or the purpose vocabulary moving.
--
-- =====================================================================================
-- THE FIRST MEASUREMENT: A LIST OF ADVANCES IS DATA, SO IT IS A TABLE, NOT A JSONB COLUMN.
--
-- 0221's own header states the rule this file obeys: "EVERY FOREIGN KEY CARRIES THE TENANT
-- (0182:320-326 / 0194 §C's S4 correction): a single-column `work_id uuid references
-- clara.accounting_work(id)` is satisfied by ANY firm's Work, and the only thing preventing a
-- cross-tenant citation would be that one function is the sole writer — a property of CODE, not
-- of DATA." A jsonb array of advance ids on the claim row would be exactly that property of code.
-- The single `advance_id` column it widens carries
-- `fk_staff_expense_claims_advance (advance_id, firm_id, client_id)`; the list keeps that grade by
-- being a child table whose every row carries the same three-column FK to `clara.staff_advances`
-- AND to the claim.
--
-- THE CLAIM ROW'S OWN COLUMNS DO NOT MOVE, and that is what "the single-advance shape stays valid
-- for existing rows" means structurally. `advance_id` and `advance_account_code` keep
-- `ck_staff_expense_claims_settlement` true and now carry THE HEAD of the confirmed list; every
-- row written before this file is its own head, and §G backfills exactly that one-element list so
-- the read has ONE shape to answer with rather than two.
--
-- =====================================================================================
-- THE SECOND MEASUREMENT: ONE CREDIT LEG PER ADVANCE ACCOUNT, BECAUSE THE BELT COUNTS PER LINE.
--
-- `clara._tf_adv_movement_belt` (0043:3045) reads coverage PER JOURNAL LINE: a credit on an
-- enrolled advance account passes only when `sum(applications on THAT line, kind <> 'correction')`
-- equals the line's own `credit_cents`, to the sen. And
-- `uq_staff_advance_applications_line_advance (application_line_id, advance_id)` admits SEVERAL
-- allocations on ONE line as long as they name different advances.
--
-- SO THE DERIVATION IS: group the confirmed allocations BY ACCOUNT CODE, one credit leg each,
-- carrying that account's allocations added together. Two advances on ONE dedicated account →ONE
-- leg and TWO allocation rows keyed to it. Two advances on TWO enrolled accounts → TWO legs, one
-- allocation each. Both satisfy the belt by construction, and neither needs the belt, the hook
-- roster or the cap to change. The account order is the ACCOUNT CODE's own, so the derived basis
-- is deterministic and the admitted `basis_digest` is reproducible.
--
-- =====================================================================================
-- THE THIRD MEASUREMENT: THE CAP IS ASKED ONCE PER ALLOCATION, NEVER ONCE PER CLAIM.
--
-- `clara._adv_over_application` (0043:1220) answers about ONE advance and ONE proposed amount,
-- walking every boundary at or after the date. A claim that names two advances makes TWO
-- proposals, and asking the cap about the claim TOTAL against the head advance would refuse a
-- lawful split and admit an unlawful one. This file therefore asks the SHARED body once per
-- allocation — in both places 0221 asks it (the door's world half, and §E's deferred birth
-- trigger) — and never re-derives the arithmetic.
--
-- =====================================================================================
-- THE FOURTH MEASUREMENT: "BELONGS TO THIS CLAIMANT" HAS ONE ENFORCEABLE READING, AND ITS LIMIT
-- IS NAMED RATHER THAN HIDDEN.
--
-- #931 asks that "every advance named must belong to this claimant on an enrolled account" AND
-- that "advances on different enrolled accounts may be discharged together". 0221's D4 is that the
-- claimant IS an enrolment handle and there is NO staff master: `clara.staff_advance_accounts`
-- carries `person_label`, "a LABEL ON THE ACCOUNT, not a person record" (0043:939-941).
--
-- So ownership is read in two arms, strongest first:
--   (a) the advance's own `enrolment_id` IS the claim's claimant enrolment — the whole of the
--       single-account case, and every claim this estate has ever written; or
--   (b) the advance's enrolment is ANOTHER LIVE enrolment OF THIS CLIENT whose `person_label` is
--       byte-identical after `btrim` to the claimant enrolment's.
-- Arm (b) is what makes the second dedicated account reachable. It compares two ADMIN-ATTESTED
-- enrolment rows (each written through `clara.enrol_staff_advance_account`, admin+, with
-- `confirm_dedicated` and an attestation), NOT a free-text claimant string against a record — the
-- identity drift D4 refuses. It is deliberately CASE-SENSITIVE and whitespace-trimmed only:
-- strictness here can only REFUSE a lawful claim (which the preparer fixes by naming the other
-- claimant), never admit an unlawful one. When a staff master lands, arm (b) is what it replaces.
-- Anything else is refused `advance_allocation_mismatch` / `not_this_claimant`, naming the advance.
--
-- NOTE THIS IS A NEW WALL, NOT A LOOSENED ONE. 0221 checked only that the advance sat on the
-- claim's own `advance_account_code`; it never asked whose advance it was.
--
-- =====================================================================================
-- THE FIFTH MEASUREMENT: THE CANONICAL FORM GAINS A KEY ONLY WHEN THE SUBMISSION DOES.
--
-- `clara._claim_basis_canonical` is the REPLAY comparison: `clara.admit_staff_expense_claim_work`
-- step 4 answers `intent_payload_conflict` when a repeated intent key carries a different
-- canonical claim. Every claim row already stored holds the OLD canonical bytes, so adding an
-- unconditional key would turn every lawful replay of a pre-0301 claim into a conflict.
--
-- So `advance_allocations` appears in the canonical form ONLY when the normalised list has TWO OR
-- MORE elements. A one-element list IS the single-advance claim, and `advance_id` +
-- `settlement_account_code` already carry it — so `{advance_id: X}` and
-- `{advance_allocations: [{advance_id: X, amount_cents: <total>}]}` canonicalise to the SAME bytes,
-- which is what canonicalisation is for, and every pre-0301 row still replays byte for byte.
-- Changing a split, or splitting what was one advance, moves the key and is a typed conflict.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT TOUCH, AND PINS: the posting core
-- `clara._record_journal_entry_core` (#931 AC6 asks for exactly this proof), the belt
-- `clara._tf_adv_movement_belt`, the shared cap `clara._adv_over_application`, the enrolment
-- reader `clara._adv_enrolment_at`, the SS3.2 outstanding `clara._adv_outstanding`, the claimant
-- resolver `clara._claim_resolve_claimant`, the claim's append-only belt, the item total, and
-- `clara.get_work_claim_origin`. §0 pins them before and §H re-derives them after.
--
-- REDO SAFETY (#957). Every DDL statement below is guarded or idempotent (`create table if not
-- exists`, `create index if not exists`, `create or replace function|trigger`, policies created
-- only when absent, the backfill `on conflict do nothing`), and the prestate takes a REDO branch
-- on the marker only this file writes. A redo over this file's own effects is a no-op plus a
-- re-proof.
-- =====================================================================================

do $p931_pre$
declare
  v_sha text; v_pin record; v_redo boolean := false;
  -- THE LIVE PRE-IMAGES, measured off pg_proc.prosrc on the lane-02 rig (clara_l02, PG 17, chain
  -- 0001..0295) moments before this file was written, never transcribed from an older header.
  c_settlement_pre constant text :=
    '3fbb1b8124dbac63e241beee6f78130196bde0a313adb0b7ad72eaecaa9ca37a';
  c_canonical_pre constant text :=
    '6734eef84ced62e22475548b10a065255a75f622419eea895a46baec36a874f8';
  c_journal_pre constant text :=
    '7378e1be94753bb10eed6c6a53a32c56191d0b0eb601b71f22615b877fa3a424';
  c_assert_pre constant text :=
    '7d42194b01f00ff09b2ea36904972f4e6354bdf1f4dd7611d17e7c47933671a5';
  c_admit_pre constant text :=
    '75b123e1787f5ce1dad8ffc2452cbdd3111f943341ddbe1af6e68ed1ce5988d9';
  c_birth_pre constant text :=
    '57c6588bea5bf048c51028a463602cfc708c6f5bbceccb6e84e4ff67791bf59a';
  c_get_pre constant text :=
    '5706139aa23fc04b22813f2fd4262dae493757887beef16bbc015590c01b4a18';
  c_list_pre constant text :=
    'c32840670acc0c77ba96eeb4f8a0563f9537ab7de760067d1861b781f19742d0';
begin
  if to_regclass('clara.staff_expense_claims') is null
     or to_regprocedure('clara._adv_over_application(uuid,bigint,date,bigint,date)') is null then
    raise exception '#931 prestate: 0221 (or 0043) is absent -- both must apply first'
      using errcode = 'CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957.) The signal is the marker only this file writes into
  -- the recut validator.
  select p.prosrc into v_sha from pg_proc p
   where p.oid = 'clara._assert_claim_basis(uuid,jsonb,boolean)'::regprocedure;
  if position('#931 (0301' in coalesce(v_sha, '')) > 0 then
    v_redo := true;
    raise notice '#931 prestate: the recut validator already carries this file''s marker -- treating this as a #957 REDO of 0301 itself. Every statement below is redo-safe by construction; the tail re-proves the whole post-state from scratch.';
  end if;

  -- THE EIGHT BODIES THIS FILE RECUTS, at their measured 0221 post-images.
  for v_pin in select * from (values
      ('clara._claim_settlement_account(jsonb)', c_settlement_pre),
      ('clara._claim_basis_canonical(jsonb)', c_canonical_pre),
      ('clara._claim_journal_basis(jsonb)', c_journal_pre),
      ('clara._assert_claim_basis(uuid,jsonb,boolean)', c_assert_pre),
      ('clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)', c_admit_pre),
      ('clara._tf_adv_claim_application_birth()', c_birth_pre),
      ('clara.get_staff_expense_claim(uuid)', c_get_pre),
      ('clara.list_staff_expense_claims(uuid,date,date)', c_list_pre)
      ) as t(sig, sha) loop
    if v_redo then continue; end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is null then
      raise exception '#931 prestate: % is absent', v_pin.sig using errcode = 'CLR10';
    end if;
    if v_sha <> v_pin.sha then
      raise exception '#931 prestate: % has DRIFTED from its pinned pre-image (measured %, expected %) -- this file carries 0221''s bodies byte for byte apart from the allocation list, so re-derive it against the LIVE body before applying', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- NON-REGRESSION, pinned and NOT recut by this file. The posting core heads the list: #931 AC6
  -- asks for exactly this proof, and the belt and the shared cap are the two bodies a
  -- multi-advance claim would be most tempting to "help".
  for v_pin in select * from (values
      ('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)',
       'c4396f6cb28d6832ffe7efed98fb23af2ad776c25f57feda0fb6d14c0b7762bb'),
      ('clara._tf_adv_movement_belt()',
       'a874760c248fb40208fda20e37bd94f3acf982f4ec8e1dcf64d0a4798884678e'),
      ('clara._adv_over_application(uuid,bigint,date,bigint,date)',
       'b4e9188bc59d0f151bf7ad9854356970662e02e4d9f2c94e7e9eaf54d8ad8769'),
      ('clara._adv_enrolment_at(uuid,text,timestamptz)',
       '54ae3c5dfec46e55c18eb9db72b94b2b4ab38f953fcf65481eb0e762ce93ebfe'),
      ('clara._adv_outstanding(uuid,date)',
       '06e9175d8b719d6cf4c66a01b7ddfaa9cd71676017ac59234461780fa9930445'),
      ('clara._subledger_on_approve(uuid)',
       '6e37c601ff716e0c73b3061bcb503cc01539f2f237841650657fa2d9600accfd'),
      ('clara._adv_on_approve(uuid)',
       'ddf4159f2e38b3f76005bfa5b70787b7b6aa591a410de95eb0e2717100813ac2'),
      ('clara._claim_resolve_claimant(uuid,uuid,jsonb,text)',
       '5ce41a7b5fb900e28111d82676d6b4f31d05e543c6bf19cc49fa1b6cd418404c'),
      ('clara._claim_item_total(jsonb)',
       '72db918d4d259a3effebd24f9593bd6e1038eb0797a1fb1bc4b0cc10b06cbb8c'),
      ('clara._tf_staff_expense_claim_append_only()',
       '49df1b131cd39b178adf30fbd934c8846245b87a9e69455788afbfd4f68beb13'),
      ('clara.get_work_claim_origin(uuid)',
       'd2b9f1d1a28136f59dff36870d2926d501e38c35c7726f190ea3bddea02e46f8')) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#931 prestate: % MOVED (measured %, expected %) -- this file recuts exactly eight bodies and nothing else', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#931 prestate: clean (% apply) -- the eight recut bodies are at their measured 0221 post-images and the eleven bodies this file does NOT touch, including the posting core, the belt and the shared temporal cap, are unmoved.',
    case when v_redo then 'REDO' else 'FIRST' end;
end
$p931_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE CONFIRMED ALLOCATION LIST. Append-only, one row per (claim, advance), carrying the
--     ordinal the preparer confirmed so the record reads back in the order it was agreed.
--
--     WHY `ordinal` AND NOT just `created_at`: the list is the RECORD of a decision, and "which
--     advance did they put first" is part of that decision (the date-ordered suggestion puts the
--     OLDEST first, and a preparer who reorders it is saying something). A timestamp cannot carry
--     an order inside one transaction, where every row lands at the same `now()`.
--
--     NO UPDATE, NO DELETE, NO TRUNCATE: the claim it belongs to is append-only and its whole
--     point is to record what was CONFIRMED. A correction is a NEW claim (0221 §A), not a rewrite.
-- =====================================================================================
create table if not exists clara.staff_expense_claim_allocations (
  id            uuid        primary key default gen_random_uuid(),
  firm_id       uuid        not null references clara.firms(id),
  client_id     uuid        not null,
  claim_id      uuid        not null,
  advance_id    uuid        not null,
  amount_cents  bigint      not null check (amount_cents > 0),
  ordinal       int         not null check (ordinal >= 1),
  created_at    timestamptz not null default now(),
  constraint fk_sec_allocations_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_sec_allocations_claim foreign key (claim_id, firm_id, client_id)
    references clara.staff_expense_claims(id, firm_id, client_id),
  constraint fk_sec_allocations_advance foreign key (advance_id, firm_id, client_id)
    references clara.staff_advances(id, firm_id, client_id),
  -- ONE allocation per advance per claim: a list that named one advance twice would make
  -- "the allocations add up to the claim" true while the register held two rows for one decision.
  constraint uq_sec_allocations_claim_advance unique (claim_id, advance_id),
  constraint uq_sec_allocations_claim_ordinal unique (claim_id, ordinal)
);
comment on table clara.staff_expense_claim_allocations is
  '#931: the CONFIRMED allocation list of one staff expense claim -- which open advance it '
  'discharges and by how much, in the order the preparer confirmed. Written ONLY by '
  'clara.admit_staff_expense_claim_work inside the ADMISSION transaction; append-only, no '
  'application role holds DML. The register rows the allocation actually minted live in '
  'clara.staff_advance_applications and are read back beside this list, never instead of it.';
create index if not exists ix_sec_allocations_advance
  on clara.staff_expense_claim_allocations(advance_id);

alter table clara.staff_expense_claim_allocations enable row level security;
alter table clara.staff_expense_claim_allocations force row level security;

do $p931_pol$
begin
  if not exists (select 1 from pg_policies where schemaname = 'clara'
                  and tablename = 'staff_expense_claim_allocations'
                  and policyname = 'p_sec_allocations_owner') then
    execute 'create policy p_sec_allocations_owner on clara.staff_expense_claim_allocations'
         || ' for all to clara_fn_owner using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'clara'
                  and tablename = 'staff_expense_claim_allocations'
                  and policyname = 'p_sec_allocations_read') then
    execute 'create policy p_sec_allocations_read on clara.staff_expense_claim_allocations'
         || ' for select to clara_authenticated using (firm_id = clara.jwt_firm())';
  end if;
end
$p931_pol$;

grant select on clara.staff_expense_claim_allocations to clara_authenticated;
-- clara_runtime gets NOTHING, exactly as it gets nothing on clara.staff_expense_claims: the run is
-- told its effect by the wake verb's answer, and the web reads the row as the signed-in human.

create or replace trigger t_sec_allocations_append_only
  before update or delete on clara.staff_expense_claim_allocations
  for each row execute function clara._tf_append_only();
create or replace trigger t_sec_allocations_no_truncate
  before truncate on clara.staff_expense_claim_allocations
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §B  THE ONE NEW DERIVATION, AND THE THREE PURE BODIES THAT NOW READ IT.
-- =====================================================================================

/**
 * THE NORMALISED ALLOCATION LIST OF ONE CLAIM — `[{advance_id, amount_cents, account_code}, …]`,
 * in the order the submission states, or `[]`.
 *
 * TOTAL BY CONSTRUCTION: it raises for nothing. It is called from the payload half of
 * `clara._assert_claim_basis` BEFORE the shape rules have run, from `clara._claim_settlement_
 * account` (which the payload half calls to name the settlement leg) and from two IMMUTABLE
 * derivations, so a raise here would report a shape defect at the wrong field with the wrong
 * reason. Every malformed element normalises to a NULL member and is refused BY NAME, at its own
 * indexed path, by the validator.
 *
 * ONE SHAPE OUT OF TWO IN. A submission carrying `advance_allocations` is normalised element by
 * element, each element's `account_code` defaulting to the claim's own `advance_account_code`; a
 * submission carrying only `advance_id` is the ONE-ELEMENT list for the claim's whole amount. That
 * is what makes "the single-advance shape stays valid" a property of the derivation rather than a
 * branch every caller has to remember.
 */
create or replace function clara._claim_allocations(p_claim jsonb) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case
    when p_claim is null or jsonb_typeof(p_claim) <> 'object' then '[]'::jsonb
    when btrim(coalesce(p_claim ->> 'settlement', '')) <> 'advance_application' then '[]'::jsonb
    when jsonb_typeof(p_claim -> 'advance_allocations') = 'array'
         and jsonb_array_length(p_claim -> 'advance_allocations') > 0 then coalesce((
      select jsonb_agg(jsonb_build_object(
               'advance_id', lower(nullif(btrim(coalesce(x.elem ->> 'advance_id', '')), '')),
               'amount_cents', case
                 when coalesce(x.elem ->> 'amount_cents', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                 then trunc((x.elem ->> 'amount_cents')::numeric)::bigint end,
               'account_code', coalesce(
                 nullif(btrim(coalesce(x.elem ->> 'account_code', '')), ''),
                 nullif(btrim(coalesce(p_claim ->> 'advance_account_code', '')), '')))
             order by x.idx)
        from jsonb_array_elements(p_claim -> 'advance_allocations')
          with ordinality as x(elem, idx)), '[]'::jsonb)
    when nullif(btrim(coalesce(p_claim ->> 'advance_id', '')), '') is not null then
      jsonb_build_array(jsonb_build_object(
        'advance_id', lower(btrim(p_claim ->> 'advance_id')),
        'amount_cents', case
          when coalesce(p_claim ->> 'amount_cents', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then trunc((p_claim ->> 'amount_cents')::numeric)::bigint end,
        'account_code', nullif(btrim(coalesce(p_claim ->> 'advance_account_code', '')), '')))
    else '[]'::jsonb end;
$$;
revoke all on function clara._claim_allocations(jsonb) from public;

/* The settlement's own credit account — 0221's body, with ONE change: for an advance application
   the HEAD OF THE CONFIRMED LIST names it, falling back to the claim's own
   `advance_account_code`. Byte-identical for every claim that carries no allocation list, because
   the head's `account_code` defaults to exactly that column. */
create or replace function clara._claim_settlement_account(p_claim jsonb) returns text
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select nullif(btrim(coalesce(case btrim(coalesce(p_claim->>'settlement',''))
    when 'reimbursement'       then p_claim ->> 'payable_account_code'
    when 'advance_application' then coalesce(
      clara._claim_allocations(p_claim) -> 0 ->> 'account_code',
      nullif(btrim(coalesce(p_claim ->> 'advance_account_code', '')), ''))
    when 'already_settled'     then p_claim ->> 'payment_account_code'
    else null end, '')), '');
$$;
revoke all on function clara._claim_settlement_account(jsonb) from public;

/**
 * THE JOURNAL BASIS A CLAIM IMPLIES — 0221's body, with the settlement half widened to the second
 * measurement of this file's header: ONE CREDIT LEG PER ADVANCE ACCOUNT.
 *
 * IT IS STILL A DERIVATION, NOT A PROPOSAL, and it is still the ONLY place the lines are decided.
 * Each non-pending item is one expense DEBIT; the settlement is one credit leg per account the
 * confirmed allocations name, carrying that account's allocations added together, IN ACCOUNT-CODE
 * ORDER — so the derivation is deterministic and the admitted `basis_digest` is reproducible from
 * the claim alone. Two advances on one dedicated account still give exactly ONE leg of exactly the
 * old amount, which is what makes every claim written before 0301 derive byte for byte.
 *
 * `reimbursement` and `already_settled` keep 0221's single credit leg untouched: neither
 * discharges anything, so neither has an allocation to split.
 */
create or replace function clara._claim_journal_basis(p_claim jsonb) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'posting_date', btrim(coalesce(p_claim->>'posting_date','')),
    'memo', left(btrim(coalesce(p_claim->>'instruction','')), 4000),
    'currency', 'MYR',
    'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'account_code', btrim(coalesce(x.elem->>'expense_account_code','')),
                 'debit_cents', trunc((x.elem->>'amount_cents')::numeric)::bigint,
                 'credit_cents', 0,
                 'description', left(btrim(coalesce(x.elem->>'description','')), 2000))
                 order by x.idx)
          from jsonb_array_elements(coalesce(p_claim->'items','[]'::jsonb))
            with ordinality as x(elem, idx)
         where nullif(btrim(coalesce(x.elem->>'pending_fact','')),'') is null), '[]'::jsonb)
      || case
         when btrim(coalesce(p_claim->>'settlement','')) = 'advance_application'
              and jsonb_array_length(clara._claim_allocations(p_claim)) > 0
         then coalesce((
           select jsonb_agg(jsonb_build_object(
                    'account_code', g.code,
                    'debit_cents', 0,
                    'credit_cents', g.cents,
                    'description', btrim(coalesce(p_claim->>'settlement','')))
                  order by g.code)
             from (select a.elem ->> 'account_code' as code,
                          sum((a.elem ->> 'amount_cents')::bigint)::bigint as cents
                     from jsonb_array_elements(clara._claim_allocations(p_claim)) as a(elem)
                    group by 1) g), '[]'::jsonb)
         else jsonb_build_array(jsonb_build_object(
                'account_code', clara._claim_settlement_account(p_claim),
                'debit_cents', 0,
                'credit_cents', trunc((coalesce(nullif(p_claim->>'amount_cents',''),'0'))::numeric)::bigint,
                'description', btrim(coalesce(p_claim->>'settlement','')))) end);
$$;
revoke all on function clara._claim_journal_basis(jsonb) from public;

-- =====================================================================================
-- §C  THE CLAIM SHAPE, RECUT. 0221 §B's body, byte for byte, plus the allocation list: its shape
--     and exact sum in the PAYLOAD half, and its ownership, enrolment and per-allocation cap in
--     the WORLD half. Every pre-existing refusal keeps its code, its reason, its field and its
--     position in the order — #931 AC2's "the no-advance and wrong-client refusals keep their
--     existing reasons", asserted rather than asserted-about.
--
--     THE FIELD PATHS ARE THE SUBMISSION'S OWN. A claim that states a LIST is refused at
--     `claim.advance_allocations[i].<key>`; a claim that states the single `advance_id` is refused
--     at `claim.advance_id` / `claim.advance_account_code`, exactly as before. A surface focuses
--     the control the preparer must change, and those are two different controls.
-- =====================================================================================
create or replace function clara._assert_claim_basis(p_client uuid, p_claim jsonb,
    p_check_world boolean default true) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  e record; v_settlement text; v_incurred date; v_posting date; v_amount bigint;
  v_total bigint; v_n int; v_live int; v_code text; v_class text; v_type text;
  v_enrol uuid; v_claimant jsonb; v_credit text; v_firm uuid;
  v_target_id uuid; v_target_corrected uuid; v_target_entry uuid; v_target_reversed uuid;
  v_advance uuid; v_cap jsonb; v_fy record;
  -- #931 (0301): the confirmed allocation list.
  v_allocs jsonb; v_listed boolean; v_alloc_total bigint; v_alloc bigint;
  v_seen uuid[]; v_path text; v_field_code text; v_field_adv text;
  v_claim_enrol uuid; v_claim_label text; v_adv_enrol uuid; v_adv_code text;
begin
  if p_claim is null or jsonb_typeof(p_claim) <> 'object' then
    raise exception 'a staff expense claim is a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim","constraint":"object"}';
  end if;

  -- ---- THE CLAIMANT HANDLE -----------------------------------------------------------------
  v_claimant := p_claim -> 'claimant';
  if v_claimant is null or jsonb_typeof(v_claimant) <> 'object' then
    raise exception 'a claim names WHO claimed' using errcode='CLR10',
      detail='{"reason":"claimant_missing","field":"claim.claimant","constraint":"object"}';
  end if;
  v_enrol := clara._claim_uuid(v_claimant, 'enrolment_id', 'claim.claimant.enrolment_id');
  v_code := nullif(btrim(coalesce(v_claimant ->> 'account_code','')), '');
  if v_enrol is null and v_code is null then
    raise exception 'a claim names its claimant by enrolment or by the account dedicated to them'
      using errcode='CLR10',
      detail='{"reason":"claimant_missing","field":"claim.claimant","constraint":"present"}';
  end if;
  perform clara._claim_text(v_claimant, 'identifier', 120, 'claim.claimant.identifier', false);

  -- ---- THE TWO DATES -----------------------------------------------------------------------
  v_incurred := clara._claim_date(p_claim, 'incurred_date', 'claim.incurred_date',
    'incurred_date_missing');
  v_posting := clara._claim_date(p_claim, 'posting_date', 'claim.posting_date', 'invalid_claim');
  if v_incurred > v_posting then
    raise exception 'the expense was incurred on % but the claim posts on %', v_incurred, v_posting
      using errcode='CLR10',
      detail=jsonb_build_object('reason','incurred_after_posting','field','claim.incurred_date',
        'constraint','order','incurred_date',v_incurred,'posting_date',v_posting)::text;
  end if;

  -- ---- THE SOURCE AND THE WORDS ------------------------------------------------------------
  if btrim(coalesce(p_claim->>'source_kind','')) not in ('document','instruction') then
    raise exception 'a claim states whether its source is a document or an instruction'
      using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.source_kind","constraint":"source_kind"}';
  end if;
  perform clara._claim_text(p_claim, 'instruction', 4000, 'claim.instruction');

  if upper(btrim(coalesce(p_claim->>'currency',''))) <> 'MYR' then
    raise exception 'only MYR is supported' using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.currency","constraint":"myr"}';
  end if;

  -- ---- THE AMOUNT, BEFORE THE ITEMS --------------------------------------------------------
  v_amount := clara._claim_cents(p_claim, 'amount_cents', 'claim.amount_cents');
  if v_amount = 0 then
    raise exception 'this claim claims nothing' using errcode='CLR10',
      detail='{"reason":"claim_all_zero","field":"claim.amount_cents"}';
  end if;

  -- ---- THE ITEMISATION ----------------------------------------------------------------------
  if jsonb_typeof(p_claim -> 'items') <> 'array' then
    raise exception 'the claim items are a JSON array' using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.items","constraint":"array"}';
  end if;
  v_n := jsonb_array_length(p_claim -> 'items');
  if v_n < 1 then
    raise exception 'a claim carries at least one itemised line' using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.items","constraint":"at_least_one"}';
  end if;
  v_live := 0;
  for e in select x.elem, x.idx from jsonb_array_elements(p_claim -> 'items')
      with ordinality as x(elem, idx) loop
    if jsonb_typeof(e.elem) <> 'object' then
      raise exception 'item % is not a JSON object', e.idx using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_claim',
          'field','claim.items[' || e.idx || ']','constraint','object')::text;
    end if;
    perform clara._claim_text(e.elem, 'description', 2000,
      'claim.items[' || e.idx || '].description');
    if nullif(btrim(coalesce(e.elem ->> 'pending_fact','')),'') is not null then
      perform clara._claim_text(e.elem, 'pending_fact', 120,
        'claim.items[' || e.idx || '].pending_fact');
      if e.elem -> 'amount_cents' is not null
         and jsonb_typeof(e.elem -> 'amount_cents') <> 'null' then
        raise exception 'item % is waiting on % and may not also claim an amount', e.idx,
          e.elem ->> 'pending_fact' using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_claim',
            'field','claim.items[' || e.idx || '].amount_cents','constraint','absent')::text;
      end if;
      continue;
    end if;
    v_live := v_live + 1;
    v_code := clara._claim_text(e.elem, 'expense_account_code', 64,
      'claim.items[' || e.idx || '].expense_account_code');
    if clara._claim_cents(e.elem, 'amount_cents',
         'claim.items[' || e.idx || '].amount_cents') <= 0 then
      raise exception 'item % claims nothing', e.idx using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_claim',
          'field','claim.items[' || e.idx || '].amount_cents',
          'constraint','positive_integer_cents')::text;
    end if;
    if p_check_world then
      select a.account_type, a.account_class into v_type, v_class from clara.coa_accounts a
       where a.client_id = p_client and a.account_code = v_code and a.is_active;
      if v_type is distinct from 'expense' then
        raise exception 'item % codes to %, which is not an active expense account of this client',
          e.idx, v_code using errcode='CLR10',
          detail=jsonb_build_object('reason','item_account_not_expense',
            'field','claim.items[' || e.idx || '].expense_account_code',
            'account_code', v_code, 'account_type', v_type)::text;
      end if;
    end if;
  end loop;
  if v_live = 0 then
    raise exception 'every item on this claim is waiting on a fact; there is nothing to post'
      using errcode='CLR10', detail='{"reason":"claim_all_zero","field":"claim.items"}';
  end if;
  v_total := clara._claim_item_total(p_claim);
  if v_total <> v_amount then
    raise exception 'the items add to % but the claim states %', v_total, v_amount
      using errcode='CLR10',
      detail=jsonb_build_object('reason','items_do_not_sum','field','claim.amount_cents',
        'constraint','exact_sum','items_cents',v_total,'amount_cents',v_amount)::text;
  end if;

  -- ---- THE SETTLEMENT AND ITS CREDIT LEGS ----------------------------------------------------
  v_settlement := btrim(coalesce(p_claim->>'settlement',''));
  if v_settlement not in ('reimbursement','advance_application','already_settled') then
    raise exception 'unknown settlement %', v_settlement using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.settlement","constraint":"settlement"}';
  end if;
  v_credit := clara._claim_settlement_account(p_claim);
  if v_credit is null then
    raise exception 'a % claim names the account it settles against', v_settlement
      using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim',
        'field', 'claim.' || (case v_settlement when 'reimbursement' then 'payable_account_code'
                                                when 'advance_application' then 'advance_account_code'
                                                else 'payment_account_code' end),
        'constraint','present')::text;
  end if;

  -- ---- #931 (0301) · THE ALLOCATION LIST, PAYLOAD HALF ---------------------------------------
  -- A property of the SUBMISSION and nothing else: the shape, the distinctness, and the exact sum.
  -- Whether each advance exists, is this claimant's and can carry its share is the world half.
  v_listed := jsonb_typeof(p_claim -> 'advance_allocations') = 'array'
              and jsonb_array_length(p_claim -> 'advance_allocations') > 0;
  if p_claim -> 'advance_allocations' is not null
     and jsonb_typeof(p_claim -> 'advance_allocations') not in ('array','null') then
    raise exception 'the advance allocations are a JSON array' using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.advance_allocations","constraint":"array"}';
  end if;
  if v_listed and v_settlement <> 'advance_application' then
    raise exception 'only an advance application discharges advances, so only it carries an allocation list'
      using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.advance_allocations","constraint":"settlement"}';
  end if;
  v_allocs := clara._claim_allocations(p_claim);
  if v_listed then
    v_alloc_total := 0;
    v_seen := array[]::uuid[];
    for e in select x.elem, x.idx from jsonb_array_elements(p_claim -> 'advance_allocations')
        with ordinality as x(elem, idx) loop
      v_path := 'claim.advance_allocations[' || e.idx || ']';
      if jsonb_typeof(e.elem) <> 'object' then
        raise exception 'allocation % is not a JSON object', e.idx using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_claim','field',v_path,
            'constraint','object')::text;
      end if;
      v_advance := clara._claim_uuid(e.elem, 'advance_id', v_path || '.advance_id');
      if v_advance is null then
        raise exception 'allocation % names no advance -- there is NO silent FIFO in this register (WD-R10)',
          e.idx using errcode='CLR10',
          detail=jsonb_build_object('reason','advance_allocation_mismatch',
            'field', v_path || '.advance_id', 'constraint','present')::text;
      end if;
      if v_advance = any(v_seen) then
        raise exception 'advance % is named twice in one allocation list', v_advance
          using errcode='CLR10',
          detail=jsonb_build_object('reason','advance_allocation_mismatch',
            'field', v_path || '.advance_id', 'constraint','distinct',
            'advance_id', v_advance)::text;
      end if;
      v_seen := v_seen || v_advance;
      v_alloc := clara._claim_cents(e.elem, 'amount_cents', v_path || '.amount_cents');
      if v_alloc <= 0 then
        raise exception 'allocation % discharges nothing', e.idx using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_claim','field', v_path || '.amount_cents',
            'constraint','positive_integer_cents')::text;
      end if;
      v_alloc_total := v_alloc_total + v_alloc;
      perform clara._claim_text(e.elem, 'account_code', 64, v_path || '.account_code', false);
    end loop;
    -- THE ALLOCATIONS ADD UP TO THE CLAIM, TO THE CENT. No partial settlement and no
    -- over-allocation: #881's ruling takes both out of scope, and a claim that settles only part
    -- of itself would leave the rest owed to nobody.
    if v_alloc_total <> v_amount then
      raise exception 'the allocations add to % but the claim states %', v_alloc_total, v_amount
        using errcode='CLR10',
        detail=jsonb_build_object('reason','advance_allocation_mismatch',
          'field','claim.advance_allocations','constraint','exact_sum',
          'allocated_cents',v_alloc_total,'amount_cents',v_amount)::text;
    end if;
    -- THE HEAD IS WHAT THE CLAIM ROW'S OWN COLUMNS CARRY, so a stated head must BE the head.
    if nullif(btrim(coalesce(p_claim->>'advance_id','')),'') is not null
       and lower(btrim(p_claim->>'advance_id')) is distinct from (v_allocs -> 0 ->> 'advance_id') then
      raise exception 'claim.advance_id names an advance that is not the first allocation'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','advance_allocation_mismatch','field','claim.advance_id',
          'constraint','allocation_head')::text;
    end if;
    if nullif(btrim(coalesce(p_claim->>'advance_account_code','')),'') is not null
       and nullif(btrim(coalesce(p_claim->>'advance_account_code','')),'')
           is distinct from (v_allocs -> 0 ->> 'account_code') then
      raise exception 'claim.advance_account_code names an account that is not the first allocation''s'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','advance_allocation_mismatch',
          'field','claim.advance_account_code','constraint','allocation_head')::text;
    end if;
  end if;

  -- THE SETTLEMENT LEGS MAY NOT REPEAT AN ITEM'S OWN ACCOUNT: an entry that debits and credits one
  -- account for the same claim says nothing. Asked of EVERY credit account the claim implies.
  for e in select distinct a.code from (
             select v_credit as code
             union
             select x.elem ->> 'account_code' from jsonb_array_elements(v_allocs) as x(elem)
           ) a where a.code is not null loop
    if exists (select 1 from jsonb_array_elements(p_claim -> 'items') as x(elem)
                where nullif(btrim(coalesce(x.elem ->> 'pending_fact','')),'') is null
                  and btrim(coalesce(x.elem ->> 'expense_account_code','')) = e.code) then
      raise exception 'the settlement leg repeats an item''s own account (%)', e.code
        using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_claim','field','claim.settlement',
          'constraint','distinct','account_code',e.code)::text;
    end if;
  end loop;
  perform clara._claim_uuid(p_claim, 'corrects_claim_id', 'claim.corrects_claim_id');

  if not p_check_world then return; end if;

  -- =========================================================================================
  -- THE WORLD HALF. Everything below can change between two attempts under one intent key.
  -- =========================================================================================
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;

  -- (o) THE LOCKED PERIOD, TYPED AND EARLY.
  select * into v_fy from clara.fiscal_years fy
   where fy.client_id = p_client and v_posting between fy.starts_on and fy.ends_on
   order by (fy.status in ('closing','closed')) desc, fy.starts_on desc
   limit 1;
  if v_fy.id is not null and v_fy.status in ('closing','closed') then
    raise exception 'fiscal year % (% to %) is %; a staff expense claim dated % is not admitted into it',
      v_fy.label, v_fy.starts_on, v_fy.ends_on, v_fy.status, v_posting
      using errcode='CLR19',
      detail=jsonb_build_object('reason','write_into_closed_period','field','claim.posting_date',
        'fiscal_year_id', v_fy.id, 'fy_status', v_fy.status, 'posting_date', v_posting)::text;
  end if;

  -- (i) THE CLAIMANT IS A LIVE ENROLMENT OF THIS CLIENT — or a code the door may enrol.
  if v_enrol is not null then
    if not exists (select 1 from clara.staff_advance_accounts sa
                    where sa.id = v_enrol and sa.client_id = p_client and sa.active) then
      raise exception 'that claimant is not a live staff-advance enrolment of this client'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','claimant_not_enrolled',
          'field','claim.claimant.enrolment_id','enrolment_id',v_enrol)::text;
    end if;
  end if;

  -- (ii) THE SETTLEMENT LEG'S OWN CLASS.
  select a.account_type, a.account_class into v_type, v_class from clara.coa_accounts a
   where a.client_id = p_client and a.account_code = v_credit and a.is_active;
  if v_type is null then
    raise exception 'the settlement account % is not an active account of this client', v_credit
      using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim',
        'field', 'claim.' || (case v_settlement when 'reimbursement' then 'payable_account_code'
                                                when 'advance_application' then 'advance_account_code'
                                                else 'payment_account_code' end),
        'constraint','unknown_account','account_code',v_credit)::text;
  end if;
  if v_settlement = 'reimbursement' then
    if v_class is not null then
      raise exception 'money owed to a claimant may not sit on the control account %', v_credit
        using errcode='CLR10',
        detail=jsonb_build_object('reason','payable_account_is_control',
          'field','claim.payable_account_code','account_code',v_credit,
          'account_class',v_class)::text;
    end if;
    if v_type <> 'liability' then
      raise exception 'the claimant is owed money, so % must be a liability account', v_credit
        using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_claim','field','claim.payable_account_code',
          'constraint','liability','account_code',v_credit,'account_type',v_type)::text;
    end if;
  elsif v_settlement = 'already_settled' then
    if v_type <> 'asset' or v_class is not null then
      raise exception 'an already-settled claim is paid from an asset account, not from %', v_credit
        using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_claim','field','claim.payment_account_code',
          'constraint','asset','account_code',v_credit,'account_type',v_type)::text;
    end if;
  else
    -- (iii) THE ADVANCE ARM, WIDENED TO A LIST (#931). The head account's enrolment and the
    -- "which advance?" refusal are asked FIRST and UNCHANGED, so a claim that named no advance,
    -- or named an unenrolled account, is refused with the same reason at the same field it always
    -- was.
    if clara._adv_enrolment_at(p_client, v_credit, now()) is null then
      raise exception 'no live staff-advance enrolment carries %', v_credit using errcode='CLR10',
        detail=jsonb_build_object('reason','advance_not_enrolled',
          'field','claim.advance_account_code','account_code',v_credit)::text;
    end if;
    if jsonb_array_length(v_allocs) = 0 then
      raise exception 'an advance application names WHICH advance it discharges -- there is NO silent FIFO in this register (WD-R10)'
        using errcode='CLR10',
        detail='{"reason":"advance_allocation_mismatch","field":"claim.advance_id","constraint":"present"}';
    end if;

    -- THE CLAIMANT, resolved the way clara._claim_resolve_claimant resolves it moments later: the
    -- stated enrolment, or the live enrolment on the account dedicated to them. NULL means the
    -- door is about to AUTO-ENROL a new claimant — who by construction holds no advance yet, so
    -- every allocation below is refused by name rather than by a missing join.
    v_claim_enrol := v_enrol;
    if v_claim_enrol is null then
      v_claim_enrol := clara._adv_enrolment_at(p_client,
        nullif(btrim(coalesce(v_claimant ->> 'account_code','')), ''), now());
    end if;
    select btrim(sa.person_label) into v_claim_label
      from clara.staff_advance_accounts sa where sa.id = v_claim_enrol;

    for e in select x.elem, x.idx from jsonb_array_elements(v_allocs)
        with ordinality as x(elem, idx) loop
      v_field_code := case when v_listed
        then 'claim.advance_allocations[' || e.idx || '].account_code'
        else 'claim.advance_account_code' end;
      v_field_adv := case when v_listed
        then 'claim.advance_allocations[' || e.idx || '].advance_id'
        else 'claim.advance_id' end;
      v_code := e.elem ->> 'account_code';
      if v_code is null then
        raise exception 'allocation % names no advance account', e.idx using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_claim','field',v_field_code,
            'constraint','present')::text;
      end if;
      -- EVERY ACCOUNT A CLAIM CREDITS IS AN ENROLLED ADVANCE ACCOUNT OF THIS CLIENT.
      if clara._adv_enrolment_at(p_client, v_code, now()) is null then
        raise exception 'no live staff-advance enrolment carries %', v_code using errcode='CLR10',
          detail=jsonb_build_object('reason','advance_not_enrolled','field',v_field_code,
            'account_code',v_code)::text;
      end if;
      v_advance := (e.elem ->> 'advance_id')::uuid;
      select sa.enrolment_id, sa.account_code into v_adv_enrol, v_adv_code
        from clara.staff_advances sa where sa.id = v_advance and sa.client_id = p_client;
      if v_adv_enrol is null or v_adv_code is distinct from v_code then
        raise exception 'that advance is not one this client holds on %', v_code
          using errcode='CLR10',
          detail=jsonb_build_object('reason','advance_allocation_mismatch','field',v_field_adv,
            'constraint','not_this_client','advance_id',v_advance)::text;
      end if;
      -- …AND IT WAS ISSUED TO THIS CLAIMANT. See this file's fourth measurement for why the
      -- second arm compares two admin-attested enrolment labels and what replaces it.
      if v_adv_enrol is distinct from v_claim_enrol then
        if v_claim_label is null or not exists (
             select 1 from clara.staff_advance_accounts sa2
              where sa2.id = v_adv_enrol and sa2.client_id = p_client and sa2.active
                and btrim(sa2.person_label) = v_claim_label) then
          raise exception 'that advance was not issued to this claimant' using errcode='CLR10',
            detail=jsonb_build_object('reason','advance_allocation_mismatch','field',v_field_adv,
              'constraint','not_this_claimant','advance_id',v_advance,
              'claimant_enrolment_id',v_claim_enrol)::text;
        end if;
      end if;
      -- THE SHARED CAP (0043:1220), ASKED PER ALLOCATION — never once for the claim total. A cap
      -- asked once against the head advance would refuse a lawful split and admit an unlawful one.
      --
      -- THE REFUSAL NAMES THE ADVANCE, ITS OUTSTANDING ON THE BOUNDARY DAY, AND THE SHORTFALL.
      -- `clara._adv_over_application` already answers the first two in its own object; the
      -- SHORTFALL is what the preparer has to move, and making them subtract it themselves is how
      -- a refusal stops being actionable. It is `-resulting_cents` — the cap's own arithmetic read
      -- from its own answer, never a second walk.
      --
      -- AND IT ADDRESSES THE CONTROL THEY MUST CHANGE: the allocation's own amount when the claim
      -- states a LIST, and `claim.amount_cents` when it names ONE advance (0221's own path, and
      -- still the only control there is on that shape).
      v_alloc := (e.elem ->> 'amount_cents')::bigint;
      v_cap := clara._adv_over_application(v_advance, v_alloc, v_posting);
      if v_cap is not null then
        raise exception 'that advance cannot carry this claim: % cents outstanding at %, % claimed',
          v_cap->>'outstanding_cents', v_cap->>'boundary_date', v_alloc using errcode='CLR10',
          detail=(v_cap || jsonb_build_object('reason','advance_allocation_mismatch',
            'field', case when v_listed
              then 'claim.advance_allocations[' || e.idx || '].amount_cents'
              else 'claim.amount_cents' end,
            'constraint','over_application',
            'shortfall_cents', -((v_cap->>'resulting_cents')::bigint)))::text;
      end if;
    end loop;
  end if;

  -- (iv) THE CORRECTION TARGET, if there is one.
  if clara._claim_uuid(p_claim, 'corrects_claim_id', 'claim.corrects_claim_id') is not null then
    select sec.id, sec.corrected_by_claim_id, st.entry_id, je.reversed_by
      into v_target_id, v_target_corrected, v_target_entry, v_target_reversed
      from clara.staff_expense_claims sec
      left join clara.staff_expense_claim_status st
             on st.claim_id = sec.id and st.state = 'posted'
      left join clara.journal_entries je on je.id = st.entry_id
     where sec.id = clara._claim_uuid(p_claim, 'corrects_claim_id', 'claim.corrects_claim_id')
       and sec.client_id = p_client;
    if v_target_id is null then
      raise exception 'the claim being corrected is not one of this client''s' using errcode='CLR10',
        detail='{"reason":"correction_target_not_found","field":"claim.corrects_claim_id"}';
    end if;
    if v_target_corrected is not null then
      raise exception 'that claim has already been corrected' using errcode='CLR10',
        detail=jsonb_build_object('reason','correction_target_already_corrected',
          'field','claim.corrects_claim_id','claim_id',v_target_corrected)::text;
    end if;
    if v_target_entry is not null and v_target_reversed is null then
      raise exception 'reverse the posted entry before correcting the claim it stands on'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','correction_target_live','field','claim.corrects_claim_id',
          'entry_id',v_target_entry)::text;
    end if;
  end if;
end $$;
revoke all on function clara._assert_claim_basis(uuid,jsonb,boolean) from public;

/* THE CANONICAL FORM, RECUT. 0221's body plus the fifth measurement: `advance_id` falls back to
   the head of the confirmed list, and `advance_allocations` appears ONLY when that list has two
   or more members — so every claim already stored canonicalises to exactly the bytes it was
   stored with, and a changed split is a typed conflict. */
create or replace function clara._claim_basis_canonical(p_claim jsonb) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case when p_claim is null or jsonb_typeof(p_claim) <> 'object' then null else
    jsonb_build_object(
      'claimant_enrolment_id',
        lower(nullif(btrim(coalesce(p_claim -> 'claimant' ->> 'enrolment_id','')),'')),
      'claimant_account_code', nullif(btrim(coalesce(p_claim -> 'claimant' ->> 'account_code','')),''),
      'claimant_label', nullif(btrim(coalesce(p_claim -> 'claimant' ->> 'person_label','')),''),
      'claimant_identifier', nullif(btrim(coalesce(p_claim -> 'claimant' ->> 'identifier','')),''),
      'source_kind', btrim(coalesce(p_claim->>'source_kind','')),
      'instruction', btrim(coalesce(p_claim->>'instruction','')),
      'incurred_date', btrim(coalesce(p_claim->>'incurred_date','')),
      'posting_date', btrim(coalesce(p_claim->>'posting_date','')),
      'amount_cents', trunc((coalesce(nullif(p_claim->>'amount_cents',''),'0'))::numeric)::bigint,
      'currency', upper(btrim(coalesce(p_claim->>'currency',''))),
      'settlement', btrim(coalesce(p_claim->>'settlement','')),
      'settlement_account_code', clara._claim_settlement_account(p_claim),
      'advance_id', coalesce(lower(nullif(btrim(coalesce(p_claim->>'advance_id','')),'')),
                             clara._claim_allocations(p_claim) -> 0 ->> 'advance_id'),
      'corrects_claim_id', lower(nullif(btrim(coalesce(p_claim->>'corrects_claim_id','')),'')),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'description', btrim(coalesce(x.elem->>'description','')),
                 'expense_account_code', nullif(btrim(coalesce(x.elem->>'expense_account_code','')),''),
                 'amount_cents', case when jsonb_typeof(x.elem->'amount_cents') = 'number'
                                      then trunc((x.elem->>'amount_cents')::numeric)::bigint end,
                 'supplied_tax', x.elem -> 'supplied_tax',
                 'incurred_date', nullif(btrim(coalesce(x.elem->>'incurred_date','')),''),
                 'pending_fact', nullif(btrim(coalesce(x.elem->>'pending_fact','')),''))
                 order by x.idx)
          from jsonb_array_elements(coalesce(p_claim->'items','[]'::jsonb))
            with ordinality as x(elem, idx)), '[]'::jsonb))
    || case when jsonb_array_length(clara._claim_allocations(p_claim)) >= 2
            then jsonb_build_object('advance_allocations', clara._claim_allocations(p_claim))
            else '{}'::jsonb end
  end;
$$;
revoke all on function clara._claim_basis_canonical(jsonb) from public;

-- =====================================================================================
-- §D  THE PUBLIC DOOR, RECUT. 0221 §C's body, byte for byte, plus ONE insert: the confirmed
--     allocation list, written in the SAME admission transaction as the claim it belongs to. The
--     claim row's own `advance_id` now takes the HEAD of that list rather than the raw field, so
--     a claim that states only the list still satisfies `ck_staff_expense_claims_settlement`.
-- =====================================================================================
create or replace function clara.admit_staff_expense_claim_work(p_client uuid, p_author uuid,
    p_intent_key text, p_claim jsonb, p_basis_origin text, p_source_refs jsonb, p_model text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_client_status text; v_role text; v_member_status text;
  v_canon jsonb; v_basis jsonb; v_res jsonb; v_work uuid; v_claim uuid;
  v_enrol uuid; v_label text; v_settlement text; v_credit text; v_corrects uuid;
  v_doc uuid; v_pending jsonb; v_prior_claim uuid; v_prior_basis jsonb;
  v_allocs jsonb;   -- #931 (0301)
begin
  -- 1 · THE KEY, FIRST (C82.1).
  if p_intent_key is null or p_intent_key ~ '^\s*$' then
    raise exception 'a staff-expense-claim intent requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_intent_key","constraint":"nonempty"}';
  end if;

  -- 2 · THE PAYLOAD HALF.
  perform clara._assert_claim_basis(p_client, p_claim, false);
  v_canon := clara._claim_basis_canonical(p_claim);

  -- 3 · THE AUTHORITY PREAMBLE.
  select c.firm_id, c.status into v_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the author is not an active member of this firm' using errcode='CLR04',
      detail='{"reason":"actor_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'recording a staff expense claim requires a bookkeeper or above'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accounting work' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- 4 · THE REPLAY PROBE.
  select w.id into v_work from clara.accounting_work w
   where w.firm_id = v_firm and w.client_id = p_client and w.intent_key = p_intent_key;
  if v_work is not null then
    select sec.id, sec.basis into v_prior_claim, v_prior_basis
      from clara.staff_expense_claims sec where sec.work_id = v_work;
    if v_prior_claim is null then
      raise exception 'this intent key already carries a different accounting work'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','intent_payload_conflict','work_id',v_work,
          'field','claim')::text;
    end if;
    if v_prior_basis is distinct from v_canon then
      raise exception 'this intent key already carries a different staff expense claim'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','intent_payload_conflict','work_id',v_work,
          'field','claim')::text;
    end if;
    v_basis := clara._claim_journal_basis(p_claim);
    v_res := clara._admit_accounting_work_core(p_client, p_author, p_intent_key, 'journal_entry',
      v_basis, null, p_basis_origin, p_source_refs, p_model);
    return v_res || jsonb_build_object('claim_id', v_prior_claim);
  end if;

  -- 5 · THE WORLD HALF, ASKED CHEAPLY.
  perform clara._assert_claim_basis(p_client, p_claim, true);

  -- 6 · THE CLAIMANT.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  perform clara._fa_lock_roles(p_client);

  -- 6a · THE WORLD HALF AGAIN, THIS TIME UNDER THE RUNG THAT MAKES THE ANSWER DURABLE.
  perform clara._assert_claim_basis(p_client, p_claim, true);

  v_enrol := clara._claim_resolve_claimant(p_client, p_author, p_claim, p_intent_key);
  select sa.person_label into v_label from clara.staff_advance_accounts sa where sa.id = v_enrol;

  -- 7 · THE UNCHANGED CORE.
  v_basis := clara._claim_journal_basis(p_claim);
  v_res := clara._admit_accounting_work_core(p_client, p_author, p_intent_key, 'journal_entry',
    v_basis, null, p_basis_origin, p_source_refs, p_model);
  v_work := (v_res->>'work_id')::uuid;

  -- 8 · THE CLAIM ROW, inside the SAME transaction.
  v_settlement := btrim(coalesce(p_claim->>'settlement',''));
  v_credit := clara._claim_settlement_account(p_claim);
  v_allocs := clara._claim_allocations(p_claim);
  v_corrects := clara._claim_uuid(p_claim, 'corrects_claim_id', 'claim.corrects_claim_id');
  v_doc := clara._journal_source_document(p_source_refs);
  insert into clara.staff_expense_claims(firm_id, client_id, work_id, logical_op_id,
      claimant_enrolment_id, claimant_label, claimant_identifier, source_kind, source_document_id,
      instruction, incurred_date, posting_date, items, amount_cents, currency, settlement,
      payable_account_code, advance_account_code, payment_account_code, advance_id, basis,
      corrects_claim_id, recorded_by, on_behalf_of)
    values (v_firm, p_client, v_work, v_res->>'logical_op_id', v_enrol, v_label,
      nullif(btrim(coalesce(p_claim -> 'claimant' ->> 'identifier','')),''),
      btrim(p_claim->>'source_kind'), v_doc, btrim(p_claim->>'instruction'),
      (p_claim->>'incurred_date')::date, (p_claim->>'posting_date')::date,
      v_canon -> 'items', trunc((p_claim->>'amount_cents')::numeric)::bigint,
      upper(btrim(p_claim->>'currency')), v_settlement,
      case when v_settlement = 'reimbursement' then v_credit end,
      case when v_settlement = 'advance_application' then v_credit end,
      case when v_settlement = 'already_settled' then v_credit end,
      -- THE HEAD OF THE CONFIRMED LIST (#931). For a claim that names one advance the raw field
      -- and the head are the same uuid, so every row written before 0301 reads identically.
      case when v_settlement = 'advance_application'
           then (v_allocs -> 0 ->> 'advance_id')::uuid end,
      v_canon, v_corrects, p_author, p_author)
    on conflict (work_id) do nothing;
  select sec.id into v_claim from clara.staff_expense_claims sec where sec.work_id = v_work;

  -- 8a · THE CONFIRMED ALLOCATION LIST (#931), one row per named advance, in the confirmed order.
  -- `on conflict do nothing` for the same reason the claim insert above carries one: this door
  -- converges rather than races.
  if v_settlement = 'advance_application' then
    insert into clara.staff_expense_claim_allocations(firm_id, client_id, claim_id, advance_id,
        amount_cents, ordinal)
      select v_firm, p_client, v_claim, (x.elem ->> 'advance_id')::uuid,
             (x.elem ->> 'amount_cents')::bigint, x.idx::int
        from jsonb_array_elements(v_allocs) with ordinality as x(elem, idx)
      on conflict (claim_id, advance_id) do nothing;
  end if;

  insert into clara.staff_expense_claim_status(firm_id, client_id, claim_id, state, detail)
    values (v_firm, p_client, v_claim, 'admitted',
      jsonb_build_object('admitted_by', p_author, 'settlement', v_settlement))
    on conflict (claim_id, state) do nothing;

  -- THE WAITING ITEMS, NAMED.
  select jsonb_agg(jsonb_build_object('description', x.elem->>'description',
                                      'pending_fact', x.elem->>'pending_fact')
                   order by x.idx)
    into v_pending
    from jsonb_array_elements(v_canon -> 'items') with ordinality as x(elem, idx)
   where nullif(btrim(coalesce(x.elem->>'pending_fact','')),'') is not null;
  if v_pending is not null then
    insert into clara.staff_expense_claim_status(firm_id, client_id, claim_id, state, detail)
      values (v_firm, p_client, v_claim, 'items_pending', jsonb_build_object('items', v_pending))
      on conflict (claim_id, state) do nothing;
  end if;

  -- THE BACK-POINTER, stamped by the CORRECTING row in the same transaction.
  if v_corrects is not null then
    update clara.staff_expense_claims set corrected_by_claim_id = v_claim
     where id = v_corrects and client_id = p_client;
  end if;

  perform clara._audit(v_firm, p_author, null, null, 'admit_staff_expense_claim_work', null,
    jsonb_build_object('client', p_client, 'work', v_work, 'claim', v_claim,
      'logical_op_id', v_res->>'logical_op_id', 'intent_key', p_intent_key,
      'settlement', v_settlement, 'claimant_enrolment_id', v_enrol,
      'allocation_count', jsonb_array_length(v_allocs),
      'amount_cents', trunc((p_claim->>'amount_cents')::numeric)::bigint));

  return v_res || jsonb_build_object('claim_id', v_claim);
end $$;
revoke all on function clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text) from public;
grant execute on function clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text) to clara_runtime;
comment on function clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text) is
  '#638 (+#931): admit ONE staff expense claim as durable accounting work. clara_runtime ONLY, the '
  'lane clara.admit_journal_work and clara.admit_periodic_adjustment_work sit in, acting OBO the '
  'named p_author. The Work''s purpose is journal_entry -- the posting core is UNCHANGED -- and '
  'the typed claim lives in clara.staff_expense_claims with its CONFIRMED allocation list in '
  'clara.staff_expense_claim_allocations, all written in this same transaction. Idempotent on '
  '(firm, client, intent_key); the payload comparison covers the canonical claim, including a '
  'multi-advance split.';

-- =====================================================================================
-- §E  THE LANE-AGNOSTIC ADVANCE BIRTH TRIGGER, RECUT TO THE LIST.
--
--     ONE ALLOCATION ROW PER CONFIRMED ALLOCATION, each keyed to the credit leg on ITS OWN
--     advance account and carrying ITS OWN amount —
--     `uq_staff_advance_applications_line_advance (application_line_id, advance_id)` is what makes
--     two allocations on ONE line lawful, and the belt's per-line coverage sum is what makes them
--     add up. The shared cap is asked per allocation, never once for the claim.
--
--     THE LOCKS ARE TAKEN IN ADVANCE-ID ORDER, so two claims naming the same pair of advances
--     serialise instead of deadlocking. The idempotence probe is asked BEFORE the cap, per
--     allocation, so a replay never re-tests an allocation it already made.
-- =====================================================================================
create or replace function clara._tf_adv_claim_application_birth() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_claim uuid; v_firm uuid; v_client uuid; v_obo uuid; r record;
  v_line uuid; v_cap jsonb;
begin
  -- ONE indexed lookup (ix_operation_receipts_entry) and one more (uq_staff_expense_claims_work):
  -- an approved entry that is not a claim's leaves here immediately.
  select sec.id, sec.firm_id, sec.client_id, sec.on_behalf_of
    into v_claim, v_firm, v_client, v_obo
    from clara.operation_receipts rc
    join clara.staff_expense_claims sec on sec.work_id = rc.work_id
   where rc.outcome = 'committed' and (rc.effects ->> 'entry_id') = new.id::text
     and sec.settlement = 'advance_application'
   limit 1;
  if v_claim is null then return null; end if;

  for r in select al.advance_id, al.amount_cents, sa.account_code, sa.enrolment_id
             from clara.staff_expense_claim_allocations al
             join clara.staff_advances sa on sa.id = al.advance_id
            where al.claim_id = v_claim
            order by al.advance_id
  loop
    -- THE CREDIT LEG THIS ALLOCATION DISCHARGES, by the account its own advance sits on.
    select jl.id into v_line
      from clara.journal_lines jl
     where jl.entry_id = new.id and jl.account_code = r.account_code and jl.credit_cents > 0
     order by jl.line_no limit 1;
    if v_line is null then continue; end if;   -- nothing to register; the belt speaks for itself

    -- IDEMPOTENT, and asked before the cap so a replay never re-tests an allocation it already made.
    if exists (select 1 from clara.staff_advance_applications ap
                where ap.application_line_id = v_line and ap.advance_id = r.advance_id) then
      continue;
    end if;

    -- THE ROW LOCK, THEN THE SHARED CAP.
    perform 1 from clara.staff_advances sa where sa.id = r.advance_id for update;
    if not exists (select 1 from clara.staff_advances sa
                    where sa.id = r.advance_id and sa.client_id = v_client) then
      raise exception 'this claim discharges an advance this client does not hold'
        using errcode='CLR40',
        detail=jsonb_build_object('reason','advance_allocation_mismatch','entry_id',new.id,
          'advance_id',r.advance_id,'claim_id',v_claim)::text;
    end if;
    v_cap := clara._adv_over_application(r.advance_id, r.amount_cents, new.posting_date);
    if v_cap is not null then
      raise exception 'this claim would over-apply advance %: % cents outstanding at %, % claimed',
        r.advance_id, v_cap->>'outstanding_cents', v_cap->>'boundary_date', r.amount_cents
        using errcode='CLR39',
        detail=(v_cap || jsonb_build_object('reason','advance_over_application','entry_id',new.id,
          'claim_id',v_claim,
          'shortfall_cents', -((v_cap->>'resulting_cents')::bigint)))::text;
    end if;

    insert into clara.staff_advance_applications(firm_id, client_id, advance_id, enrolment_id,
        application_line_id, entry_id, kind, amount_cents, effective_date, reverses_application_id,
        created_by, reason)
      values (v_firm, v_client, r.advance_id, r.enrolment_id, v_line, new.id, 'claim',
        r.amount_cents, new.posting_date, null, v_obo,
        'staff expense claim ' || v_claim::text)
      on conflict (application_line_id, advance_id) do nothing;
  end loop;
  return null;
end $$;
revoke all on function clara._tf_adv_claim_application_birth() from public;

-- =====================================================================================
-- §F  THE READS, RECUT. Both now answer the CONFIRMED list.
--
--     `advance_allocations` (what the preparer confirmed) sits BESIDE `advance_applications` (what
--     the register actually minted), and the two are deliberately not merged: a claim admitted but
--     not yet posted has the first and not the second, and that difference is the truth about it.
-- =====================================================================================
create or replace function clara.list_staff_expense_claims(p_client uuid, p_from date default null,
    p_to date default null) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if p_from is not null and p_to is not null and p_to < p_from then
    raise exception 'the read window ends before it starts' using errcode='CLR10',
      detail='{"reason":"invalid_request","field":"p_to","constraint":"order"}';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(r)::jsonb order by r.posting_date desc, r.created_at desc)
      from (
        select sec.id, sec.work_id, sec.logical_op_id, sec.claimant_enrolment_id,
               sec.claimant_label, sec.claimant_identifier, sec.source_kind,
               sec.source_document_id, sec.instruction, sec.incurred_date, sec.posting_date,
               sec.items, sec.amount_cents, sec.currency, sec.settlement,
               sec.payable_account_code, sec.advance_account_code, sec.payment_account_code,
               sec.advance_id, sec.corrects_claim_id, sec.corrected_by_claim_id,
               sec.recorded_by, sec.on_behalf_of, sec.created_at,
               rc.id as receipt_id,
               nullif(btrim(coalesce(rc.effects->>'entry_id','')),'')::uuid as entry_id,
               je.status as entry_status, je.reversed_by,
               (select count(*)::int from jsonb_array_elements(sec.items) i(e)
                 where nullif(btrim(coalesce(i.e->>'pending_fact','')),'') is not null)
                 as pending_item_count,
               -- #931: ONE DISCHARGE PER NAMED ADVANCE, so the register shows the claim's own list
               -- rather than making a reader infer a split from one id and one total.
               coalesce((
                 select jsonb_agg(jsonb_build_object('advance_id', al.advance_id,
                          'amount_cents', al.amount_cents, 'ordinal', al.ordinal)
                        order by al.ordinal)
                   from clara.staff_expense_claim_allocations al where al.claim_id = sec.id),
                 '[]'::jsonb) as advance_allocations
          from clara.staff_expense_claims sec
          left join clara.operation_receipts rc
                 on rc.work_id = sec.work_id and rc.outcome = 'committed'
          left join clara.journal_entries je
                 on je.id = nullif(btrim(coalesce(rc.effects->>'entry_id','')),'')::uuid
         where sec.client_id = p_client and sec.firm_id = c.firm
           and (p_from is null or sec.posting_date >= p_from)
           and (p_to is null or sec.posting_date <= p_to)
         order by sec.posting_date desc, sec.created_at desc
         limit 500) r), '[]'::jsonb);
end $$;
revoke all on function clara.list_staff_expense_claims(uuid,date,date) from public;
grant execute on function clara.list_staff_expense_claims(uuid,date,date) to clara_authenticated;

create or replace function clara.get_staff_expense_claim(p_claim uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_out jsonb; v_receipt uuid; v_entry uuid;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select to_jsonb(sec) into v_out from clara.staff_expense_claims sec
   where sec.id = p_claim and sec.firm_id = c.firm;
  if v_out is null then return null; end if;
  select rc.id, nullif(btrim(coalesce(rc.effects->>'entry_id','')),'')::uuid
    into v_receipt, v_entry
    from clara.operation_receipts rc
   where rc.work_id = (v_out->>'work_id')::uuid and rc.outcome = 'committed'
   limit 1;
  return v_out
    || jsonb_build_object(
        'receipt_id', v_receipt,
        'entry_id', v_entry,
        'entry_status', (select je.status from clara.journal_entries je where je.id = v_entry),
        'reversed_by', (select je.reversed_by from clara.journal_entries je where je.id = v_entry),
        'status', coalesce((
          select jsonb_agg(jsonb_build_object('state', st.state, 'entry_id', st.entry_id,
                   'receipt_id', st.receipt_id, 'detail', st.detail, 'recorded_at', st.recorded_at)
                 order by st.recorded_at, st.state)
            from clara.staff_expense_claim_status st where st.claim_id = p_claim), '[]'::jsonb),
        -- #931: THE CONFIRMED LIST, in the order it was confirmed.
        'advance_allocations', coalesce((
          select jsonb_agg(jsonb_build_object('advance_id', al.advance_id,
                   'amount_cents', al.amount_cents, 'ordinal', al.ordinal)
                 order by al.ordinal)
            from clara.staff_expense_claim_allocations al where al.claim_id = p_claim), '[]'::jsonb),
        'advance_applications', coalesce((
          select jsonb_agg(jsonb_build_object('id', ap.id, 'advance_id', ap.advance_id,
                   'kind', ap.kind, 'amount_cents', ap.amount_cents,
                   'effective_date', ap.effective_date, 'entry_id', ap.entry_id)
                 order by ap.created_at)
            from clara.staff_advance_applications ap
           where ap.entry_id = v_entry), '[]'::jsonb));
end $$;
revoke all on function clara.get_staff_expense_claim(uuid) from public;
grant execute on function clara.get_staff_expense_claim(uuid) to clara_authenticated;

-- =====================================================================================
-- §G  THE BACKFILL. Every advance-application claim already stored IS its own one-element list —
--     `ck_staff_expense_claims_settlement` guarantees `advance_id` is present, and
--     `clara._claim_journal_basis` credited the WHOLE `amount_cents` to it — so the list is exact,
--     not a guess. Written so the reads have ONE shape to answer with.
-- =====================================================================================
insert into clara.staff_expense_claim_allocations(firm_id, client_id, claim_id, advance_id,
    amount_cents, ordinal)
  select sec.firm_id, sec.client_id, sec.id, sec.advance_id, sec.amount_cents, 1
    from clara.staff_expense_claims sec
   where sec.settlement = 'advance_application' and sec.advance_id is not null
on conflict (claim_id, advance_id) do nothing;

reset role;

-- =====================================================================================
-- §H  TAIL CENSUS. Every claim this file makes, re-READ from the committed catalog and from the
--     rows themselves.
-- =====================================================================================
do $p931_tail$
declare v_n int; v_sha text; v_pin record; v_basis jsonb; v_probe jsonb;
begin
  -- T.1 THE RELATION: forced RLS, no application DML, the three tenant-carrying FKs and the two
  -- uniques, read out of the catalog rather than trusted from the DDL above.
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='clara' and c.relname='staff_expense_claim_allocations'
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#931 tail T.1: clara.staff_expense_claim_allocations is absent or not FORCE-RLS'
      using errcode='CLR10';
  end if;
  for v_pin in select * from (values
      ('fk_sec_allocations_client', 'f'), ('fk_sec_allocations_claim', 'f'),
      ('fk_sec_allocations_advance', 'f'),
      ('uq_sec_allocations_claim_advance', 'u'), ('uq_sec_allocations_claim_ordinal', 'u'))
      as t(cname, ctype) loop
    if not exists (select 1 from pg_constraint co
                    where co.conrelid = 'clara.staff_expense_claim_allocations'::regclass
                      and co.conname = v_pin.cname and co.contype = v_pin.ctype) then
      raise exception '#931 tail T.1b: constraint % is missing from the allocation relation',
        v_pin.cname using errcode='CLR10';
    end if;
  end loop;
  -- EVERY FOREIGN KEY CARRIES THE TENANT (0221's own rule): the claim and advance FKs are
  -- three-column, not one.
  for v_pin in select * from (values ('fk_sec_allocations_claim'), ('fk_sec_allocations_advance'))
      as t(cname) loop
    select array_length(co.conkey, 1) into v_n from pg_constraint co
     where co.conrelid = 'clara.staff_expense_claim_allocations'::regclass and co.conname = v_pin.cname;
    if v_n <> 3 then
      raise exception '#931 tail T.1c: % carries % column(s), expected the (id, firm_id, client_id) three',
        v_pin.cname, v_n using errcode='CLR10';
    end if;
  end loop;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='clara' and table_name='staff_expense_claim_allocations'
                and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
                and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro','public')) then
    raise exception '#931 tail T.1d: an application role holds DML on the allocation relation'
      using errcode='CLR10';
  end if;

  -- T.2 THE EIGHT RECUT BODIES carry this file's marker and keep their owner, definer flag and
  -- pinned search_path; the door keeps its exact ACL.
  for v_pin in select * from (values
      ('clara._claim_allocations(jsonb)'),
      ('clara._claim_settlement_account(jsonb)'),
      ('clara._claim_basis_canonical(jsonb)'),
      ('clara._assert_claim_basis(uuid,jsonb,boolean)'),
      ('clara._claim_journal_basis(jsonb)'),
      ('clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)'),
      ('clara._tf_adv_claim_application_birth()'),
      ('clara.get_staff_expense_claim(uuid)'),
      ('clara.list_staff_expense_claims(uuid,date,date)')) as t(sig) loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_pin.sig::regprocedure
       and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
       and 'search_path=clara, pg_temp' = any(p.proconfig);
    if v_n <> 1 then
      raise exception '#931 tail T.2: % lost its owner, its SECURITY DEFINER flag or its pinned search_path',
        v_pin.sig using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_pin.sig, 'EXECUTE') then
      raise exception '#931 tail T.2b: PUBLIC holds EXECUTE on %', v_pin.sig using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_sha from pg_proc p
   where p.oid = 'clara._assert_claim_basis(uuid,jsonb,boolean)'::regprocedure;
  if position('#931 (0301' in coalesce(v_sha,'')) = 0 then
    raise exception '#931 tail T.2c: the recut validator does not carry this file''s marker'
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_runtime',
       'clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)', 'EXECUTE') then
    raise exception '#931 tail T.2d: clara_runtime lost EXECUTE on the claim door' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated',
       'clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)', 'EXECUTE') then
    raise exception '#931 tail T.2e: clara_authenticated gained EXECUTE on the claim door -- the '
      'browser reaches it through the runtime route, never through PostgREST' using errcode='CLR10';
  end if;
  for v_pin in select * from (values
      ('clara.get_staff_expense_claim(uuid)'), ('clara.list_staff_expense_claims(uuid,date,date)'))
      as t(sig) loop
    if not has_function_privilege('clara_authenticated', v_pin.sig, 'EXECUTE') then
      raise exception '#931 tail T.2f: clara_authenticated lost EXECUTE on %', v_pin.sig
        using errcode='CLR10';
    end if;
  end loop;

  -- T.3 THE BACKFILL IS EXACT, read from the rows: every advance-application claim carries a
  -- confirmed list, and every list adds up to its claim, to the sen. DATA-DEPENDENT and entered:
  -- this rig holds advance-application claims written before this file (see the ticket report).
  select count(*)::int into v_n from clara.staff_expense_claims sec
   where sec.settlement = 'advance_application'
     and not exists (select 1 from clara.staff_expense_claim_allocations al
                      where al.claim_id = sec.id);
  if v_n <> 0 then
    raise exception '#931 tail T.3: % advance-application claim(s) carry NO confirmed allocation', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from (
      select al.claim_id, sum(al.amount_cents) as allocated, max(sec.amount_cents) as claimed
        from clara.staff_expense_claim_allocations al
        join clara.staff_expense_claims sec on sec.id = al.claim_id
       group by al.claim_id) g
   where g.allocated <> g.claimed;
  if v_n <> 0 then
    raise exception '#931 tail T.3b: % claim(s) whose confirmed allocations do not add up to the claim', v_n
      using errcode='CLR10';
  end if;
  -- …and the head of every list IS the claim row's own advance.
  select count(*)::int into v_n from clara.staff_expense_claims sec
    join clara.staff_expense_claim_allocations al on al.claim_id = sec.id and al.ordinal = 1
   where sec.advance_id is distinct from al.advance_id;
  if v_n <> 0 then
    raise exception '#931 tail T.3c: % claim(s) whose head allocation is not the row''s own advance', v_n
      using errcode='CLR10';
  end if;

  -- T.4 THE SINGLE-ADVANCE SHAPE IS UNCHANGED, proved on the PURE derivations rather than argued.
  -- A claim naming one advance still canonicalises WITHOUT an `advance_allocations` key and still
  -- derives ONE credit leg carrying the whole amount.
  v_probe := jsonb_build_object(
    'claimant', jsonb_build_object('account_code','1190'),
    'source_kind','instruction', 'instruction','probe', 'incurred_date','2026-03-04',
    'posting_date','2026-03-31', 'currency','MYR', 'settlement','advance_application',
    'advance_account_code','1190', 'advance_id','11111111-1111-4111-8111-111111111111',
    'amount_cents', 60500,
    'items', jsonb_build_array(jsonb_build_object('description','probe',
      'expense_account_code','6200','amount_cents',60500)));
  if (clara._claim_basis_canonical(v_probe)) ? 'advance_allocations' then
    raise exception '#931 tail T.4: a single-advance claim gained an advance_allocations key in its canonical form -- every claim stored before this file would replay as a conflict'
      using errcode='CLR10';
  end if;
  v_basis := clara._claim_journal_basis(v_probe);
  select count(*)::int into v_n from jsonb_array_elements(v_basis -> 'lines') as x(l)
   where (x.l ->> 'credit_cents')::bigint > 0;
  if v_n <> 1 then
    raise exception '#931 tail T.4b: a single-advance claim derives % credit leg(s), expected 1', v_n
      using errcode='CLR10';
  end if;
  if (select (x.l ->> 'credit_cents')::bigint from jsonb_array_elements(v_basis -> 'lines') as x(l)
       where (x.l ->> 'credit_cents')::bigint > 0) <> 60500 then
    raise exception '#931 tail T.4c: a single-advance claim no longer credits its whole amount'
      using errcode='CLR10';
  end if;
  if clara._claim_settlement_account(v_probe) <> '1190' then
    raise exception '#931 tail T.4d: the settlement account of a single-advance claim moved'
      using errcode='CLR10';
  end if;
  if jsonb_array_length(clara._claim_allocations(v_probe)) <> 1 then
    raise exception '#931 tail T.4e: a single-advance claim does not normalise to a ONE-element list'
      using errcode='CLR10';
  end if;

  -- T.5 NOTHING ELSE MOVED — the posting core first (#931 AC6), then the belt, the shared cap and
  -- the enrolment reader.
  for v_pin in select * from (values
      ('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)',
       'c4396f6cb28d6832ffe7efed98fb23af2ad776c25f57feda0fb6d14c0b7762bb'),
      ('clara._tf_adv_movement_belt()',
       'a874760c248fb40208fda20e37bd94f3acf982f4ec8e1dcf64d0a4798884678e'),
      ('clara._adv_over_application(uuid,bigint,date,bigint,date)',
       'b4e9188bc59d0f151bf7ad9854356970662e02e4d9f2c94e7e9eaf54d8ad8769'),
      ('clara._adv_enrolment_at(uuid,text,timestamptz)',
       '54ae3c5dfec46e55c18eb9db72b94b2b4ab38f953fcf65481eb0e762ce93ebfe'),
      ('clara._adv_outstanding(uuid,date)',
       '06e9175d8b719d6cf4c66a01b7ddfaa9cd71676017ac59234461780fa9930445'),
      ('clara._subledger_on_approve(uuid)',
       '6e37c601ff716e0c73b3061bcb503cc01539f2f237841650657fa2d9600accfd'),
      ('clara._adv_on_approve(uuid)',
       'ddf4159f2e38b3f76005bfa5b70787b7b6aa591a410de95eb0e2717100813ac2'),
      ('clara._claim_resolve_claimant(uuid,uuid,jsonb,text)',
       '5ce41a7b5fb900e28111d82676d6b4f31d05e543c6bf19cc49fa1b6cd418404c'),
      ('clara._claim_item_total(jsonb)',
       '72db918d4d259a3effebd24f9593bd6e1038eb0797a1fb1bc4b0cc10b06cbb8c'),
      ('clara._tf_staff_expense_claim_append_only()',
       '49df1b131cd39b178adf30fbd934c8846245b87a9e69455788afbfd4f68beb13'),
      ('clara.get_work_claim_origin(uuid)',
       'd2b9f1d1a28136f59dff36870d2926d501e38c35c7726f190ea3bddea02e46f8')) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#931 tail T.5: % MOVED (measured %, expected %)', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- T.6 THE BIRTH TRIGGER STILL SORTS BEFORE THE BELT. The name is the mechanism (0221 §E), and a
  -- recut body is exactly when somebody renames one.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'clara.journal_entries'::regclass
                    and t.tgname = 't_je_adv_claim_application_birth'
                    and t.tgname < 't_je_adv_movement_belt') then
    raise exception '#931 tail T.6: the claim birth trigger no longer sorts before the movement belt'
      using errcode='CLR10';
  end if;

  raise notice '#931 tail OK: the confirmed allocation list is an append-only, tenant-FK child relation with forced RLS and no application DML; the eight recut bodies keep their owner, definer flag, search_path and ACL; every advance-application claim on this database carries a list that adds up to it and whose head is the claim row''s own advance; a single-advance claim still canonicalises without the new key and still derives ONE credit leg of its whole amount; and the posting core, the belt, the shared cap and the enrolment reader are unmoved.';
end
$p931_tail$;
