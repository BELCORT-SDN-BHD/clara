-- 0194_periodic_adjustments — #643 (refresh spec #612; journeys C3, C8, C11): PERIODIC STOCK
-- ADJUSTMENTS AND SUPPLIED PAYROLL/STATUTORY-OBLIGATION BOOKKEEPING.
-- =====================================================================================
-- Spec of record: issue #643 — "会计师提供期间、金额和依据后，Clara 或直接会计操作可完成定期存货及
-- 工资相关费用/负债调整，结果进入正确账期与关账检查。" Domain words: CONTEXT.md — "Periodic
-- adjustment", "Supplied obligation particulars", "Accounting work", "Operation receipt". Builds
-- on 0178 (the accounting-work lane), 0182 (evidence + the source-ref predicates), 0184 (the
-- ordering boundary and the live posting core) and 0056 (the close model's drawer-2
-- closing-stock gate).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. `clara.accounting_work` gains TWO MORE PURPOSES and ONE
-- frozen column of TYPED PARTICULARS (`adjustment_basis`), so the same admission → run → commit
-- lane that records a journal entry can record a PERIODIC STOCK ADJUSTMENT or a SUPPLIED PAYROLL
-- OBLIGATION — with the account relationships asserted against the particulars, a marker flag on
-- the posted entry, a row in the new append-only `clara.periodic_adjustments`, and the
-- closing-stock close gate finally measuring a REAL producer instead of confessing it has none.
--
-- =====================================================================================
-- THE MEASUREMENT THAT SHAPES EVERYTHING BELOW: C-29's "do not simulate missing stock with a
-- balancing journal".
--
-- `clara._close_gate_closing_stock` (0056:1277) has measured `je.flags ? 'closing_stock'` on a
-- live approved entry inside the FY since the day it shipped, and has returned
-- `'no_producer_verb', true` beside the answer because NO WRITER IN THE ESTATE EVER SET THAT FLAG
-- (measured: `clara._draft_entry_core`'s `p_flags` is the coding lane's amount-exception bag, and
-- nothing in 0001-0187 writes the key). An attestation against that gate was therefore an interim
-- acceptance of a MISSING INSTRUMENT, and the gate said so on its face: "Drop this key when the
-- producer verb ships." §G below is that drop.
--
-- BUT A MARKER ALONE IS NOT A PRODUCER. A verb that merely stamped `flags` on any balanced entry
-- would satisfy the gate with an anonymous journal — exactly what C-29 forbids. So the producer
-- here carries THREE things the gate can name: the typed particulars (the period, the method, the
-- counted figures or the explicit movement, the two accounts), the RELATIONSHIP between those
-- particulars and the posted lines (asserted, not assumed), and a durable
-- `clara.periodic_adjustments` row the gate points at. The gate now answers with the adjustment's
-- own id; a bare flag on an entry nobody can trace is no longer enough to pass it.
--
-- THE PRIOR ATTESTATIONS STOP BEING EFFECTIVE, AND THAT IS INTENDED AND USER-VISIBLE. An
-- attestation binds to a gate result's `measured_digest` (0056:1466/2089-2102); dropping
-- `no_producer_verb` and adding the producer's id MOVES that digest, so a firm that had accepted
-- the missing instrument for an open close run is asked again against a gate that can now be
-- satisfied for real. Re-asking is the honest outcome: the acceptance was of an absence that no
-- longer exists.
--
-- =====================================================================================
-- THE SECOND MEASUREMENT: THE TYPED PARTICULARS MAY NOT LIVE IN `basis`.
--
-- `clara.accounting_work.basis` is ECHOED BY THE RUN. `claraWork.v1.impl.ts`'s `loadWorkStep`
-- reads it, `workEnvelopeMessage` serialises it into the model's turn, the model echoes it back
-- through the FROZEN `record_journal_entry` tool, and `_record_journal_entry_core` recomputes the
-- digest FROM THAT ECHO and compares it with the admitted one. Folding a period, a counted
-- figure or an account role into `basis` would put every one of those particulars through a
-- language model and then through a strict zod schema (`claraWork.v1.tools.ts`) that knows
-- nothing about them — admitted-but-unpostable, or worse, echoed back subtly changed.
--
-- So the particulars ride a SEPARATE FROZEN COLUMN the run never sees and never echoes, and the
-- core reads them FROM THE WORK ROW. `clara._journal_basis_digest`'s formula is deliberately
-- UNCHANGED (0182's own rule for `source_refs`, applied again): the intent-payload comparison
-- gains a second half, `clara._adjustment_basis_canonical`, exactly as 0182:676-683 added the
-- evidence half. Nothing about the journal lane's digest moves, so no existing Work, reservation
-- or receipt is re-hashed.
--
-- AND THE FROZEN WORKFLOW BODIES ARE UNTOUCHED. claraWork v1/v2 and chatTurn v18 are
-- `@frozen`/`deployed`; a periodic-adjustment Work runs through the SAME serving bundle, byte for
-- byte, because everything new is on the database side of the wake verb. The chat tool
-- `start_periodic_adjustment_work` ships later in ONE shared chatTurn v19; the non-frozen basis
-- schema/builder it will call already exists at
-- `packages/runtime/lib/periodic-adjustment-basis.mjs`.
--
-- =====================================================================================
-- THE THIRD MEASUREMENT: NO RATE, NO THRESHOLD, NO EMPLOYEE CALCULATION IS INVENTED HERE.
--
-- #643's second acceptance line is explicit: "do not invent employee calculations, current
-- contribution rates or missing settlement facts." Every number in this file arrives as a
-- SUPPLIED PARTICULAR and every account arrives as a SUPPLIED CODE. The database's job is to
-- refuse a set of particulars that does not hang together — an all-zero movement, a count taken
-- outside the period it claims, a period that leaves the fiscal year, an advance account nobody
-- enrolled, lines that do not say what the particulars say — and to record exactly what it was
-- given. It computes ONE derived figure and only as a CHECK: an `opening_closing_count` movement
-- must equal `closing_cents - opening_cents`, which is arithmetic on the accountant's own two
-- numbers, not a rate.
--
-- NO CHART TEMPLATE CHANGE EITHER. `clara.coa_template_accounts` is untouched: the liability,
-- advance and payment accounts are supplied particulars. The web form DEFAULTS
-- `liability_account_code` to the template's statutory account for the five statutory kinds
-- (2100-2140) and to `2020 Accruals` for `salary`/`other_supplied`, shows the default, and lets
-- the preparer change it. A default in a form is an offer; a template row would be a claim.
--
-- =====================================================================================
-- THE FOURTH MEASUREMENT: `clara.periodic_adjustments`, NOT `clara.adjustment_*`.
--
-- The estate already has an `adjustment_` family — `clara.adjustment_templates` /
-- `adjustment_runs` (0045, the prepayment/accrual PLAN lane, journey C8's schedules). A periodic
-- stock count and a supplied payroll obligation are NOT plan executions: they have no schedule,
-- no template and no future occurrence. Naming them `adjustment_*` would put two unrelated lanes
-- under one prefix and make every later reader guess which one a name belongs to.
--
-- =====================================================================================
-- THE REFUSAL VOCABULARY THIS FILE OWNS. Every one carries a typed `detail.reason`; the
-- field-scoped ones carry `field` and `constraint` on the SAME footing `invalid_basis` does, so
-- `apps/web/lib/work/periodic-adjustment.ts`'s `fieldForAdjustmentPath` maps them onto a control.
-- The `field` paths are prefixed `adjustment.` so they can never collide with the journal basis's
-- own (`posting_date`, `memo`, `lines[N]…`).
--
--   CLR10 invalid_adjustment              + field + constraint   shape of the particulars
--   CLR10 adjustment_all_zero             + field                a movement that moves nothing
--   CLR10 adjustment_lines_mismatch       + field + constraint   the lines do not say what the
--                                                                particulars say (C-29's rung)
--   CLR10 adjustment_account_relationship + field + constraint + account_code
--   CLR10 advance_not_enrolled            + field + account_code no live staff-advance enrolment
--   CLR10 scope_overbroad                 + field + fiscal_year_id
--   CLR10 stale_basis                     + field + constraint   counted outside its own period
--   CLR10 correction_target_not_found     + field
--   CLR10 correction_target_live          + field + entry_id     reverse before you correct
--   CLR10 correction_target_already_corrected + field + adjustment_id
--   CLR19 write_into_closed_period        + fiscal_year_id       the typed pre-check; the wall
--                                                                (t_period_wall) is still behind it
--
-- INHERITED UNCHANGED, and deliberately NOT renamed: CLR04 `obo_not_active` /
-- `insufficient_role` / `obo_not_initiator` (the commit's authority arms), CLR13 `work_cancelled`
-- / `work_settled` / `source_conflict`, CLR10 `unknown_account` / `basis_mismatch` /
-- `intent_payload_conflict` / `invalid_source_ref`. The frozen `claraWork.v1.errors.ts` roster
-- knows those tokens; a second spelling for the same fact would make a run classify its own
-- refusal as unmapped.
--
-- "THE CITED DOCUMENT IS NO LONGER FILED" IS NOT GIVEN A NEW NAME HERE. #643's stale-input line
-- covers it, and the estate already refuses it twice under names the runtime classifies:
-- `clara._assert_journal_source_refs(..., true)` raises CLR10 `invalid_source_ref` /
-- `not_filed` at admission and the core's step 7b raises CLR13 `source_conflict` at commit, both
-- through `clara._journal_document_filed`. Minting `stale_basis/source_not_filed` beside them
-- would be a second vocabulary for one refusal.
-- =====================================================================================

do $w643_pre$
declare v_sha text; v_n int;
begin
  if to_regclass('clara.accounting_work') is null then
    raise exception '#643 prestate: clara.accounting_work is absent -- 0178 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.periodic_adjustments') is not null then
    raise exception '#643 prestate: clara.periodic_adjustments already exists' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.admit_periodic_adjustment_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)') is not null then
    raise exception '#643 prestate: a periodic-adjustment admission door already exists'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='accounting_work' and column_name='adjustment_basis';
  if v_n <> 0 then
    raise exception '#643 prestate: clara.accounting_work.adjustment_basis already exists'
      using errcode='CLR10';
  end if;

  -- BOTH purpose CHECKs are the ONE-VALUED ones this file widens. Measured rather than assumed: a
  -- CHECK another lane had already widened would make §A's drop/add silently NARROW the
  -- vocabulary back to this file's three.
  if pg_get_constraintdef((select oid from pg_constraint
        where conrelid='clara.accounting_work'::regclass and conname='accounting_work_purpose_check'))
     <> 'CHECK ((purpose = ''journal_entry''::text))' then
    raise exception '#643 prestate: accounting_work_purpose_check is not the one-valued 0178 CHECK'
      using errcode='CLR10';
  end if;
  if pg_get_constraintdef((select oid from pg_constraint
        where conrelid='clara.operation_receipts'::regclass and conname='operation_receipts_purpose_check'))
     <> 'CHECK ((purpose = ''journal_entry''::text))' then
    raise exception '#643 prestate: operation_receipts_purpose_check is not the one-valued 0178 CHECK'
      using errcode='CLR10';
  end if;

  -- THE FOUR BODIES THIS FILE RECUTS, PINNED. A recut derived from a body that has since DRIFTED
  -- would delete an arm nobody re-derived. The pins are the live 0182/0184/0056 texts as measured
  -- on a from-scratch 0001->0187 chain.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if v_sha <> '71825bb8d6baf51c6092ddb22d3536a5aaf8d502e775eef0eb3ca59338d2a994' then
    raise exception '#643 prestate: clara._record_journal_entry_core has DRIFTED from the pinned 0184 body (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)'::regprocedure;
  if v_sha <> '15535149bae5f6a8e50b577928270d638075c87cd8e3560cdd4c4c5ab5d1d0ac' then
    raise exception '#643 prestate: clara.admit_journal_work has DRIFTED from the pinned 0182 body (sha %) -- the extraction below is derived from that exact text', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._close_gate_closing_stock(uuid,uuid)'::regprocedure;
  if v_sha <> 'b5daab9ea4bca292f0ac47c06b595557487691b6e78fb35914fff3dd365861c3' then
    raise exception '#643 prestate: clara._close_gate_closing_stock has DRIFTED from the pinned 0056 body (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._tf_accounting_work_immutable()'::regprocedure;
  if v_sha <> '2c4e2c9f158163058298afc4f1923ef3592938a65a231024584df65e5d8e0054' then
    raise exception '#643 prestate: clara._tf_accounting_work_immutable has DRIFTED from the pinned 0184 body (sha %)', v_sha
      using errcode='CLR10';
  end if;

  -- The gate this file retires still CONFESSES its missing instrument. If it did not, a producer
  -- would already have shipped and §G would be a second, competing one.
  select p.prosrc into v_sha from pg_proc p
   where p.oid='clara._close_gate_closing_stock(uuid,uuid)'::regprocedure;
  if position('no_producer_verb' in v_sha) = 0 then
    raise exception '#643 prestate: the closing-stock gate no longer confesses no_producer_verb -- a producer already shipped'
      using errcode='CLR10';
  end if;

  -- The staff-advance enrolment register the payroll arm reads. Absent = 0043 did not apply, and
  -- `advance_not_enrolled` could never be raised honestly.
  if to_regclass('clara.staff_advance_accounts') is null then
    raise exception '#643 prestate: clara.staff_advance_accounts is absent -- 0043 must apply first'
      using errcode='CLR10';
  end if;

  raise notice '#643 prestate: clean -- no periodic-adjustment surface exists, both purpose CHECKs carry their single 0178 value, the four recut bodies are at their pinned 0182/0184/0056 texts, and the closing-stock gate still confesses no_producer_verb.';
end
$w643_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE TWO NEW PURPOSES. Both CHECKs widen; neither loses a value.
--
-- `purpose` is in `_tf_accounting_work_immutable`'s frozen array (0184:449), so a Work's purpose
-- is decided at admission and never moves. Widening the CHECK therefore widens what may be
-- ADMITTED, and nothing about an existing row.
-- =====================================================================================
alter table clara.accounting_work drop constraint accounting_work_purpose_check;
alter table clara.accounting_work add constraint accounting_work_purpose_check
  check (purpose in ('journal_entry', 'periodic_stock_adjustment', 'payroll_obligation'));

alter table clara.operation_receipts drop constraint operation_receipts_purpose_check;
alter table clara.operation_receipts add constraint operation_receipts_purpose_check
  check (purpose in ('journal_entry', 'periodic_stock_adjustment', 'payroll_obligation'));

-- =====================================================================================
-- §B  THE TYPED PARTICULARS, ON THEIR OWN FROZEN COLUMN.
--
-- NULL IFF the purpose is `journal_entry`, by CHECK rather than by convention: a periodic
-- adjustment whose particulars were absent would be a Work the core could not relate to its own
-- lines, and a journal entry carrying particulars would be a second, unread basis.
-- =====================================================================================
alter table clara.accounting_work add column adjustment_basis jsonb;
alter table clara.accounting_work add constraint ck_accounting_work_adjustment_basis check (
  (purpose = 'journal_entry' and adjustment_basis is null)
  or (purpose <> 'journal_entry'
      and adjustment_basis is not null and jsonb_typeof(adjustment_basis) = 'object'));
comment on column clara.accounting_work.adjustment_basis is
  '#643: the TYPED PARTICULARS of a periodic stock adjustment or a supplied payroll obligation. '
  'NULL for purpose=journal_entry. Frozen after admission by t_accounting_work_immutable and '
  'NEVER echoed by the run: the run sees `basis` only, and clara._record_journal_entry_core reads '
  'this column from the Work row.';

-- clara._tf_accounting_work_immutable — RECUT. Full 0184 §A body; the addition is ONE array
-- element, marked `#643`. The particulars are an identity column for the same reason `basis` is:
-- the digest comparison, the relationship assertion and the posted marker all describe THIS
-- object, and a column a later writer could edit would be a record of nothing. 0184's own
-- `initiator` authority wall — the ONE mutable authority column and its bookkeeper-floor check —
-- is carried through verbatim.
create or replace function clara._tf_accounting_work_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  -- #643 · `adjustment_basis` joins the frozen set for the same reason `basis` is in it.
  v_frozen text[] := array['id','firm_id','client_id','purpose','initiated_by','initiator_role',
                           'intent_key','logical_op_id','basis','basis_digest','basis_origin',
                           'adjustment_basis','created_at'];
  c text; v_role text; v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'accounting work is never deleted (settle it, do not erase it)'
      using errcode='CLR08', detail='{"reason":"accounting_work_immutable","column":"*"}';
  end if;
  foreach c in array v_frozen loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'accounting work column % is immutable after admission', c
        using errcode='CLR08',
          detail=jsonb_build_object('reason','accounting_work_immutable','column',c)::text;
    end if;
  end loop;
  -- #630 · the ONE mutable authority column, and its wall.
  if new.initiator is distinct from old.initiator then
    select m.role, m.status into v_role, v_status from clara.firm_memberships m
     where m.user_id = new.initiator and m.firm_id = new.firm_id
     order by (m.status = 'active') desc, m.created_at desc limit 1;
    if v_role is null or v_status <> 'active'
       or clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
      raise exception 'accounting work may only be handed to an active bookkeeper of its own firm'
        using errcode='CLR04',
          detail=jsonb_build_object('reason','responsible_not_authorised','column','initiator')::text;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function clara._tf_accounting_work_immutable() from public;

-- =====================================================================================
-- §C  clara.periodic_adjustments — THE DURABLE RECORD OF ONE COMPLETED ADJUSTMENT.
--
-- Written ONLY by `clara._record_journal_entry_core`, inside the posting transaction, beside the
-- entry and the receipt it names. No application role holds DML; the read is the human one.
--
-- APPEND-ONLY WITH EXACTLY ONE MUTABLE COLUMN — the `clara.entry_evidence_links` /
-- `clara.close_write_permits` idiom, not a general UPDATE. `corrected_by_adjustment_id` moves
-- NULL → an id ONCE, stamped by the CORRECTING row's own insert in the same transaction, so the
-- chain is readable in both directions without any row being rewritten. Everything else, and
-- DELETE, and TRUNCATE, refuse.
--
-- EVERY FOREIGN KEY CARRIES THE TENANT, and that is a correction rather than a flourish
-- (adversarial migration-safety review, S4). A single-column `entry_id uuid references
-- clara.journal_entries(id)` is satisfied by ANY firm's entry: the row could structurally cite
-- another tenant's entry, receipt or document, and the only thing preventing it would be that
-- `clara._record_journal_entry_core` is the sole writer — a property of code, not of the data.
-- The estate's own idiom is `clara.entry_evidence_links` (0182:320-326): carry the tenant columns
-- INTO the reference, against the composite unique the referenced table exposes. Each of the
-- three is matched to the widest composite that table actually has:
--   * `clara.journal_entries`     → `uq_journal_entries_id_firm_client` (0009:799) — firm+client
--   * `clara.operation_receipts`  → nothing existed; §C.0 below adds the same three-column unique
--   * `clara.documents`           → `uq_documents_id_firm` (0007:58) — FIRM only, and correctly
--     so: `clara.documents` has no client column at all, the FILING is what binds a document to a
--     client, and 0182's own document FK is the identical two-column shape.
-- `source_document_id` is NULLABLE and the reference is MATCH SIMPLE (the default), so a row with
-- no document skips the check entirely — exactly how 0182's nullable `work_id` behaves.
-- =====================================================================================

-- §C.0 · THE COMPOSITE UNIQUE `clara.operation_receipts` did not have. Purely additive: it grants
-- nothing, refuses nothing that `id`'s primary key already admits (firm_id and client_id are both
-- NOT NULL, so the triple is unique exactly when `id` is), and exists so the FK below can carry
-- the tenant. The identical move 0009:799 made for `clara.journal_entries`.
alter table clara.operation_receipts
  add constraint uq_operation_receipts_id_firm_client unique (id, firm_id, client_id);

create table clara.periodic_adjustments (
  id                         uuid        primary key default gen_random_uuid(),
  firm_id                    uuid        not null references clara.firms(id),
  client_id                  uuid        not null,
  work_id                    uuid        not null,
  logical_op_id              text        not null check (logical_op_id !~ '^\s*$'),
  purpose                    text        not null
                               check (purpose in ('periodic_stock_adjustment','payroll_obligation')),
  period_start               date        not null,
  period_end                 date        not null,
  -- The typed particulars AS ADMITTED, canonical form. The Work row keeps the raw submission;
  -- this is the comparable one, so a reader never has to guess whether a padded account code and
  -- a trimmed one are the same claim.
  basis                      jsonb       not null check (jsonb_typeof(basis) = 'object'),
  -- SIGNED for a stock movement (a count below opening is a real, negative movement) and positive
  -- for a payroll obligation. Exact minor units; never a float anywhere in this lane.
  amount_cents               bigint      not null,
  currency                   text        not null check (currency = 'MYR'),
  -- The three CITATIONS. Each is a composite reference carrying this row's own tenant columns —
  -- see THE TENANT note in this section's header for why, and for which composite each one lands
  -- on. The constraints themselves are declared at the foot of this table beside the other FKs.
  entry_id                   uuid        not null,
  receipt_id                 uuid        not null,
  source_document_id         uuid,
  corrects_adjustment_id     uuid        references clara.periodic_adjustments(id),
  corrected_by_adjustment_id uuid        references clara.periodic_adjustments(id),
  recorded_by                uuid        not null references clara.users(id),
  on_behalf_of               uuid        not null references clara.users(id),
  created_at                 timestamptz not null default now(),
  constraint ck_periodic_adjustments_period check (period_end >= period_start),
  -- A row may never be its own correction, in either direction.
  constraint ck_periodic_adjustments_self check (
    id is distinct from corrects_adjustment_id and id is distinct from corrected_by_adjustment_id),
  constraint fk_periodic_adjustments_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_periodic_adjustments_work foreign key (work_id, firm_id, client_id)
    references clara.accounting_work(id, firm_id, client_id),
  constraint fk_periodic_adjustments_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint fk_periodic_adjustments_receipt foreign key (receipt_id, firm_id, client_id)
    references clara.operation_receipts(id, firm_id, client_id),
  -- FIRM-WIDE, because `clara.documents` carries no client column: the filing binds a document to
  -- a client, and `clara._assert_journal_source_refs` is what checks THIS client's live filing.
  constraint fk_periodic_adjustments_document foreign key (source_document_id, firm_id)
    references clara.documents(id, firm_id),
  -- ONE adjustment per logical operation identity — the structural half of "duplicate / lost
  -- acknowledgement / restart yields ONE effect", beside `uq_operation_receipts_committed`.
  constraint uq_periodic_adjustments_logical unique (logical_op_id),
  constraint uq_periodic_adjustments_id_firm_client unique (id, firm_id, client_id)
);
comment on table clara.periodic_adjustments is
  '#643: one completed periodic stock adjustment or supplied payroll obligation, written ONLY by '
  'clara._record_journal_entry_core inside the posting transaction. Append-only apart from the '
  'one-way corrected_by_adjustment_id stamp; no role holds DML; uq_periodic_adjustments_logical '
  'is the structural half of one-effect-per-logical-identity.';

-- ONE correction per target, structurally: two Works correcting one adjustment would leave the
-- chain ambiguous and the back-stamp racing itself.
create unique index uq_periodic_adjustments_corrects
  on clara.periodic_adjustments(corrects_adjustment_id) where (corrects_adjustment_id is not null);
create index ix_periodic_adjustments_client
  on clara.periodic_adjustments(client_id, period_end desc, created_at desc);
create index ix_periodic_adjustments_work on clara.periodic_adjustments(work_id);
create index ix_periodic_adjustments_entry on clara.periodic_adjustments(entry_id);

alter table clara.periodic_adjustments enable row level security;
alter table clara.periodic_adjustments force row level security;
create policy p_periodic_adjustments_owner on clara.periodic_adjustments
  for all to clara_fn_owner using (true) with check (true);
create policy p_periodic_adjustments_read on clara.periodic_adjustments
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.periodic_adjustments to clara_authenticated;
-- clara_runtime gets NOTHING, exactly as it gets nothing on clara.operation_receipts: the run is
-- told its effect by the wake verb's answer, and the web reads the row as the signed-in human.

create function clara._tf_periodic_adjustment_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a periodic adjustment is never deleted (correct it, do not erase it)'
      using errcode='CLR08',
        detail='{"reason":"periodic_adjustment_immutable","column":"*"}';
  end if;
  -- THE ONE ADMITTED UPDATE: the correction back-pointer, NULL -> an id, once. Everything else is
  -- compared column by column so a future writer cannot quietly widen this by adding a SET.
  if old.corrected_by_adjustment_id is not null
     or new.corrected_by_adjustment_id is null then
    raise exception 'a periodic adjustment admits exactly one update: stamping its correction, once'
      using errcode='CLR08',
        detail='{"reason":"periodic_adjustment_immutable","column":"corrected_by_adjustment_id"}';
  end if;
  if new.id is distinct from old.id
     or new.firm_id is distinct from old.firm_id
     or new.client_id is distinct from old.client_id
     or new.work_id is distinct from old.work_id
     or new.logical_op_id is distinct from old.logical_op_id
     or new.purpose is distinct from old.purpose
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.basis is distinct from old.basis
     or new.amount_cents is distinct from old.amount_cents
     or new.currency is distinct from old.currency
     or new.entry_id is distinct from old.entry_id
     or new.receipt_id is distinct from old.receipt_id
     or new.source_document_id is distinct from old.source_document_id
     or new.corrects_adjustment_id is distinct from old.corrects_adjustment_id
     or new.recorded_by is distinct from old.recorded_by
     or new.on_behalf_of is distinct from old.on_behalf_of
     or new.created_at is distinct from old.created_at then
    raise exception 'a periodic adjustment is append-only apart from its correction stamp'
      using errcode='CLR08',
        detail='{"reason":"periodic_adjustment_immutable","column":"*"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_periodic_adjustment_append_only() from public;
create trigger t_periodic_adjustments_append_only
  before update or delete on clara.periodic_adjustments
  for each row execute function clara._tf_periodic_adjustment_append_only();
create trigger t_periodic_adjustments_no_truncate before truncate on clara.periodic_adjustments
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §D  THE ADJUSTMENT PREDICATES. Ungranted; shared by admission and by commit so the two can
-- never disagree about what a well-formed set of particulars is — 0178 §D's rule for the basis
-- and 0182 §B's for the evidence, applied a third time.
-- =====================================================================================

-- A minor-unit value out of the particulars, or NULL for anything that is not a JSON number.
-- TOTAL and IMMUTABLE, because the canonical form below has to be both: it is also read for rows
-- admitted before a later build, and a cast that raised would make an unrelated replay
-- unanswerable (`clara._journal_source_refs_canonical`'s own reason for being lenient).
--
-- `trunc(...::numeric)` rather than `::bigint`, for the measured reason 0178 records: jsonb keeps
-- a number's scale, so `->>` hands `120000.0` to the cast and a bare `::bigint` raises a bare
-- 22P02 with no CLR code. The VALIDATOR below refuses a fractional value by name; this one only
-- has to be stable.
create function clara._adjustment_cents_value(p_obj jsonb, p_key text) returns bigint
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case when jsonb_typeof(p_obj -> p_key) = 'number'
                   and abs((p_obj ->> p_key)::numeric) <= 9223372036854775807::numeric
              then trunc((p_obj ->> p_key)::numeric)::bigint end;
$$;
revoke all on function clara._adjustment_cents_value(jsonb,text) from public;

-- Exactly-one-integer-minor-unit with the offending PATH in the detail — `clara._journal_cents`
-- for the particulars, with a SIGNED mode. A stock movement is signed on purpose: a count BELOW
-- the opening figure is a real, negative movement and refusing it would make the form lie about
-- what a count can say. A payroll obligation is unsigned: a negative obligation is a correction,
-- and a correction is a linked Work, not a minus sign.
create function clara._adjustment_cents(p_obj jsonb, p_key text, p_signed boolean,
    p_required boolean default true) returns bigint
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_val numeric;
begin
  if p_obj -> p_key is null or jsonb_typeof(p_obj -> p_key) = 'null' then
    if not p_required then return null; end if;
    raise exception 'the particulars need %', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_adjustment',
        'field', 'adjustment.' || p_key, 'constraint','present')::text;
  end if;
  if jsonb_typeof(p_obj -> p_key) <> 'number' then
    raise exception '%: minor units must be an integer JSON number', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_adjustment',
        'field', 'adjustment.' || p_key, 'constraint','integer_cents')::text;
  end if;
  v_val := (p_obj ->> p_key)::numeric;
  if v_val <> trunc(v_val) or abs(v_val) > 9223372036854775807::numeric then
    raise exception '%: minor units must be a whole number', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_adjustment',
        'field', 'adjustment.' || p_key, 'constraint','integer_cents')::text;
  end if;
  if not p_signed and v_val < 0 then
    raise exception '%: minor units must not be negative', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_adjustment',
        'field', 'adjustment.' || p_key, 'constraint','nonnegative_integer_cents')::text;
  end if;
  return v_val::bigint;
end $$;
revoke all on function clara._adjustment_cents(jsonb,text,boolean,boolean) from public;

-- A required ISO calendar date out of the particulars, refused by name rather than coerced.
create function clara._adjustment_date(p_obj jsonb, p_key text, p_required boolean default true)
  returns date
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_raw text; v_out date;
begin
  v_raw := nullif(btrim(coalesce(p_obj ->> p_key, '')), '');
  if v_raw is null then
    if not p_required then return null; end if;
    raise exception 'the particulars need %', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_adjustment',
        'field', 'adjustment.' || p_key, 'constraint','present')::text;
  end if;
  begin
    v_out := v_raw::date;
  exception when others then
    raise exception '% is not a calendar date: %', p_key, v_raw using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_adjustment',
        'field', 'adjustment.' || p_key, 'constraint','iso_date')::text;
  end;
  return v_out;
end $$;
revoke all on function clara._adjustment_date(jsonb,text,boolean) from public;

-- A required non-empty supplied string, capped. `!~ '^\s*$'` rather than `btrim(...) <> ''` for
-- 0178's measured reason: one-argument btrim strips SPACES ONLY, so a tab-or-newline value would
-- have satisfied the house idiom.
create function clara._adjustment_text(p_obj jsonb, p_key text, p_max int,
    p_required boolean default true) returns text
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_raw text;
begin
  v_raw := p_obj ->> p_key;
  if v_raw is null or v_raw ~ '^\s*$' then
    if not p_required then return null; end if;
    raise exception 'the particulars need %', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_adjustment',
        'field', 'adjustment.' || p_key, 'constraint','nonempty')::text;
  end if;
  if char_length(btrim(v_raw)) > p_max then
    raise exception '% is % characters; the maximum is %', p_key, char_length(btrim(v_raw)), p_max
      using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_adjustment',
        'field', 'adjustment.' || p_key, 'constraint','max_length', 'max', p_max,
        'length', char_length(btrim(v_raw)))::text;
  end if;
  return btrim(v_raw);
end $$;
revoke all on function clara._adjustment_text(jsonb,text,int,boolean) from public;

-- THE SHAPE OF ONE SET OF PARTICULARS, field-scoped exactly as `clara._assert_journal_basis` is.
--
-- A `journal_entry` purpose takes NO particulars and says so by name rather than ignoring them:
-- a caller who sent particulars to the journal door believed something about what would happen.
--
-- THE ONE DERIVED FIGURE IN THIS FILE lives here: for `opening_closing_count` the supplied
-- movement must equal `closing_cents - opening_cents`. That is arithmetic on the accountant's own
-- two numbers — never a rate, never a threshold — and it is a CHECK rather than a computation:
-- the database refuses a set of figures that contradicts itself, it does not fill one in.
create function clara._assert_adjustment_basis(p_purpose text, p_adjustment jsonb) returns void
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare
  v_start date; v_end date; v_amount bigint; v_open bigint; v_close bigint;
  v_method text; v_kind text; v_inv text; v_cost text; v_exp text; v_liab text;
  v_adv text; v_pay text; v_counted date;
begin
  if p_purpose = 'journal_entry' then
    if p_adjustment is not null then
      raise exception 'a journal-entry work carries no typed particulars' using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment","constraint":"not_supported"}';
    end if;
    return;
  end if;
  if p_purpose not in ('periodic_stock_adjustment','payroll_obligation') then
    raise exception 'unknown accounting-work purpose %', p_purpose using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_purpose','field','purpose')::text;
  end if;
  if p_adjustment is null or jsonb_typeof(p_adjustment) <> 'object' then
    raise exception 'the typed particulars are a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_adjustment","field":"adjustment","constraint":"object"}';
  end if;

  -- ---- the half both purposes share -------------------------------------------------
  v_start := clara._adjustment_date(p_adjustment, 'period_start');
  v_end   := clara._adjustment_date(p_adjustment, 'period_end');
  if v_end < v_start then
    raise exception 'the period ends before it starts (% .. %)', v_start, v_end using errcode='CLR10',
      detail='{"reason":"invalid_adjustment","field":"adjustment.period_end","constraint":"order"}';
  end if;
  if upper(btrim(coalesce(p_adjustment->>'currency',''))) <> 'MYR' then
    raise exception 'only MYR is supported' using errcode='CLR10',
      detail='{"reason":"invalid_adjustment","field":"adjustment.currency","constraint":"myr"}';
  end if;
  -- THE INSTRUCTION IS THE BASIS IN WORDS, and it is required for the same reason a documentless
  -- entry's memo is (`clara.journal_entries`' own ck_je_basis): a movement nobody explained is a
  -- figure without a reason. Capped at the memo's own 4000 so a form cannot admit one the posted
  -- entry could not carry.
  perform clara._adjustment_text(p_adjustment, 'instruction', 4000);
  -- The CORRECTION LINK, optional and shape-checked here; the world half (does it exist, is its
  -- entry reversed, is it already corrected) is `_assert_adjustment_relationships`'s.
  if nullif(btrim(coalesce(p_adjustment->>'corrects_adjustment_id','')),'') is not null then
    begin
      perform (p_adjustment->>'corrects_adjustment_id')::uuid;
    exception when others then
      raise exception 'corrects_adjustment_id does not name an adjustment' using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.corrects_adjustment_id","constraint":"uuid"}';
    end;
  end if;

  if p_purpose = 'periodic_stock_adjustment' then
    v_method := btrim(coalesce(p_adjustment->>'method',''));
    if v_method not in ('opening_closing_count','explicit_adjustment') then
      raise exception 'unknown stock-adjustment method %', v_method using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.method","constraint":"method"}';
    end if;
    v_inv  := clara._adjustment_text(p_adjustment, 'inventory_account_code', 64);
    v_cost := clara._adjustment_text(p_adjustment, 'cost_account_code', 64);
    if v_inv = v_cost then
      raise exception 'the inventory and cost legs name one account (%)', v_inv using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.cost_account_code","constraint":"distinct"}';
    end if;
    v_amount := clara._adjustment_cents(p_adjustment, 'adjustment_cents', true);
    if v_method = 'opening_closing_count' then
      v_open  := clara._adjustment_cents(p_adjustment, 'opening_cents', false);
      v_close := clara._adjustment_cents(p_adjustment, 'closing_cents', false);
      if v_amount <> v_close - v_open then
        raise exception 'the counted movement is % but closing - opening is %',
          v_amount, v_close - v_open using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_adjustment',
            'field','adjustment.adjustment_cents','constraint','derived_amount',
            'opening_cents', v_open, 'closing_cents', v_close)::text;
      end if;
    else
      -- An EXPLICIT movement carries no count. Refused by name rather than ignored: a set of
      -- particulars carrying both would leave a reader unable to say which one the entry stands
      -- on, and the derived-amount check above would silently not have run.
      if p_adjustment ? 'opening_cents' or p_adjustment ? 'closing_cents' then
        raise exception 'an explicit adjustment carries no opening/closing count' using errcode='CLR10',
          detail='{"reason":"invalid_adjustment","field":"adjustment.opening_cents","constraint":"absent"}';
      end if;
    end if;
    v_counted := clara._adjustment_date(p_adjustment, 'counted_at', false);
    if v_counted is not null and (v_counted < v_start or v_counted > v_end) then
      -- STALE INPUT, by #643's own name: a count taken outside the period it is offered for is
      -- not evidence about that period. It is a payload fact, so it is refused at ADMISSION.
      raise exception 'the count was taken on %, outside % .. %', v_counted, v_start, v_end
        using errcode='CLR10',
        detail=jsonb_build_object('reason','stale_basis','field','adjustment.counted_at',
          'constraint','counted_at_outside_period', 'counted_at', v_counted,
          'period_start', v_start, 'period_end', v_end)::text;
    end if;
    perform clara._adjustment_text(p_adjustment, 'count_reference', 200, false);
    if v_amount = 0 then
      raise exception 'this adjustment moves no money' using errcode='CLR10',
        detail=jsonb_build_object('reason','adjustment_all_zero',
          'field','adjustment.adjustment_cents')::text;
    end if;
  else
    v_kind := btrim(coalesce(p_adjustment->>'obligation_kind',''));
    if v_kind not in ('epf','socso','eis','pcb_mtd','hrdf','salary','other_supplied') then
      raise exception 'unknown obligation kind %', v_kind using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.obligation_kind","constraint":"obligation_kind"}';
    end if;
    v_exp  := clara._adjustment_text(p_adjustment, 'expense_account_code', 64);
    v_liab := clara._adjustment_text(p_adjustment, 'liability_account_code', 64);
    if v_exp = v_liab then
      raise exception 'the expense and liability legs name one account (%)', v_exp using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.liability_account_code","constraint":"distinct"}';
    end if;
    v_adv := clara._adjustment_text(p_adjustment, 'advance_account_code', 64, false);
    v_pay := clara._adjustment_text(p_adjustment, 'payment_account_code', 64, false);
    if v_adv is not null and v_adv in (v_exp, v_liab) then
      raise exception 'the advance leg repeats another named account (%)', v_adv using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.advance_account_code","constraint":"distinct"}';
    end if;
    if v_pay is not null and v_pay in (v_exp, v_liab, coalesce(v_adv,'')) then
      raise exception 'the payment leg repeats another named account (%)', v_pay using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.payment_account_code","constraint":"distinct"}';
    end if;
    -- WHERE THE FIGURES CAME FROM, in the accountant's own words. Required, because #643's
    -- boundary is "supplied obligation particulars": an amount with no stated source would be an
    -- obligation the estate could not attribute to anything a human said.
    perform clara._adjustment_text(p_adjustment, 'particulars_source', 500);
    v_amount := clara._adjustment_cents(p_adjustment, 'amount_cents', false);
    if v_amount = 0 then
      raise exception 'this obligation moves no money' using errcode='CLR10',
        detail=jsonb_build_object('reason','adjustment_all_zero',
          'field','adjustment.amount_cents')::text;
    end if;
  end if;
end $$;
revoke all on function clara._assert_adjustment_basis(text,jsonb) from public;

-- ONLY EVER CALLED ON VALIDATED PARTICULARS, and the same rule 0178 states for the basis applies:
-- the cents are read back through the SAME total reader, never a second cast written beside it.
--
-- WHAT THIS IS FOR. It is the comparison half of the intent-payload conflict — the SECOND half
-- 0182 added for `source_refs`, minted a third time here. Re-submitting one intent key with the
-- SAME figures but a DIFFERENT period, method, obligation kind or account is a typed conflict
-- rather than a replay that silently drops the change. It does NOT enter
-- `clara._journal_basis_digest`: that formula is unchanged, so nothing already admitted re-hashes.
create function clara._adjustment_basis_canonical(p_purpose text, p_adjustment jsonb) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case
    when p_adjustment is null or jsonb_typeof(p_adjustment) <> 'object' then null
    when p_purpose = 'periodic_stock_adjustment' then jsonb_build_object(
      'purpose', p_purpose,
      'period_start', btrim(coalesce(p_adjustment->>'period_start','')),
      'period_end',   btrim(coalesce(p_adjustment->>'period_end','')),
      'method',       btrim(coalesce(p_adjustment->>'method','')),
      'opening_cents', clara._adjustment_cents_value(p_adjustment, 'opening_cents'),
      'closing_cents', clara._adjustment_cents_value(p_adjustment, 'closing_cents'),
      'counted_at',    nullif(btrim(coalesce(p_adjustment->>'counted_at','')),''),
      'count_reference', nullif(btrim(coalesce(p_adjustment->>'count_reference','')),''),
      'inventory_account_code', btrim(coalesce(p_adjustment->>'inventory_account_code','')),
      'cost_account_code',      btrim(coalesce(p_adjustment->>'cost_account_code','')),
      'adjustment_cents', clara._adjustment_cents_value(p_adjustment, 'adjustment_cents'),
      'currency', upper(btrim(coalesce(p_adjustment->>'currency',''))),
      'instruction', btrim(coalesce(p_adjustment->>'instruction','')),
      'corrects_adjustment_id',
        lower(nullif(btrim(coalesce(p_adjustment->>'corrects_adjustment_id','')),'')))
    when p_purpose = 'payroll_obligation' then jsonb_build_object(
      'purpose', p_purpose,
      'period_start', btrim(coalesce(p_adjustment->>'period_start','')),
      'period_end',   btrim(coalesce(p_adjustment->>'period_end','')),
      'obligation_kind', btrim(coalesce(p_adjustment->>'obligation_kind','')),
      'expense_account_code',   btrim(coalesce(p_adjustment->>'expense_account_code','')),
      'liability_account_code', btrim(coalesce(p_adjustment->>'liability_account_code','')),
      'advance_account_code', nullif(btrim(coalesce(p_adjustment->>'advance_account_code','')),''),
      'payment_account_code', nullif(btrim(coalesce(p_adjustment->>'payment_account_code','')),''),
      'amount_cents', clara._adjustment_cents_value(p_adjustment, 'amount_cents'),
      'currency', upper(btrim(coalesce(p_adjustment->>'currency',''))),
      'particulars_source', btrim(coalesce(p_adjustment->>'particulars_source','')),
      'instruction', btrim(coalesce(p_adjustment->>'instruction','')),
      'corrects_adjustment_id',
        lower(nullif(btrim(coalesce(p_adjustment->>'corrects_adjustment_id','')),'')))
    else null end;
$$;
revoke all on function clara._adjustment_basis_canonical(text,jsonb) from public;

-- The SIGNED movement this set of particulars records, in exact minor units. One reader, so the
-- stored `amount_cents`, the relationship check and the close gate can never disagree.
create function clara._adjustment_amount_cents(p_purpose text, p_adjustment jsonb) returns bigint
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case when p_purpose = 'periodic_stock_adjustment'
              then clara._adjustment_cents_value(p_adjustment, 'adjustment_cents')
              else clara._adjustment_cents_value(p_adjustment, 'amount_cents') end;
$$;
revoke all on function clara._adjustment_amount_cents(text,jsonb) from public;

-- The net debit (positive) or credit (negative) a canonical line array puts on one account.
create function clara._adjustment_net_cents(p_lines jsonb, p_code text) returns bigint
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select coalesce(sum(coalesce((x.elem->>'debit_cents')::bigint,0)
                    - coalesce((x.elem->>'credit_cents')::bigint,0)), 0)::bigint
    from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) as x(elem)
   where btrim(coalesce(x.elem->>'account_code','')) = p_code;
$$;
revoke all on function clara._adjustment_net_cents(jsonb,text) from public;

-- THE RUNG C-29 ASKS FOR: the posted lines must SAY WHAT THE PARTICULARS SAY.
--
-- Without it, a "closing-stock adjustment" could be any balanced pair of accounts wearing a
-- marker — which is precisely "simulate missing stock with a balancing journal". With it, the
-- movement, the direction and the accounts are the same fact on both sides of the Work row, and
-- a reader of `clara.periodic_adjustments` can trust that the entry beside it is that movement.
--
-- TWO CLASSES OF CHECK, AND `p_check_world` IS WHICH ONE — 0182's own rule, restated. The PAYLOAD
-- half is a property of the submission and never changes: which accounts the lines name, in which
-- direction, for how much. The WORLD half changes under the caller's feet: whether an account is
-- still active and of the right class, whether a staff-advance enrolment is still live, whether
-- the period still sits inside one open fiscal year, whether the adjustment being corrected is
-- still correctable. Admission runs the payload half BEFORE anything durable and the world half
-- AFTER the replay branch; the commit runs the payload half before it reserves and the world half
-- after, so a refused operation leaves the logical identity unspent.
create function clara._assert_adjustment_relationships(p_client uuid, p_purpose text,
    p_adjustment jsonb, p_lines jsonb, p_check_world boolean default true) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_amount bigint; v_abs bigint; v_inv text; v_cost text; v_exp text; v_liab text;
  v_adv text; v_pay text; v_n int; v_named text[]; v_bad text;
  v_start date; v_end date; v_fy record; v_fy_n int; v_target record; v_firm uuid;
begin
  if p_purpose = 'journal_entry' then return; end if;
  v_amount := clara._adjustment_amount_cents(p_purpose, p_adjustment);
  v_abs := abs(coalesce(v_amount, 0));
  v_start := (p_adjustment->>'period_start')::date;
  v_end   := (p_adjustment->>'period_end')::date;
  select c.firm_id into v_firm from clara.clients c where c.id = p_client;

  if p_purpose = 'periodic_stock_adjustment' then
    v_inv  := btrim(coalesce(p_adjustment->>'inventory_account_code',''));
    v_cost := btrim(coalesce(p_adjustment->>'cost_account_code',''));
    if not p_check_world then
      -- EXACTLY TWO LINES. A stock movement is one debit and one credit; a third leg would be
      -- another accounting fact riding a marker the close gate reads.
      v_n := jsonb_array_length(coalesce(p_lines,'[]'::jsonb));
      if v_n <> 2 then
        raise exception 'a periodic stock adjustment posts exactly two lines (got %)', v_n
          using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch','field','lines',
            'constraint','two_lines','lines', v_n)::text;
      end if;
      -- …AND THEY ARE THE TWO NAMED ACCOUNTS, in the direction the SIGN of the movement fixes:
      -- a positive movement (the count is above the opening figure) DEBITS inventory and CREDITS
      -- the cost account; a negative one is its mirror.
      if clara._adjustment_net_cents(p_lines, v_inv) <> (case when v_amount > 0 then v_abs else -v_abs end) then
        raise exception 'the inventory leg does not carry the movement' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.inventory_account_code','constraint','inventory_leg',
            'account_code', v_inv, 'expected_net_cents',
            (case when v_amount > 0 then v_abs else -v_abs end),
            'actual_net_cents', clara._adjustment_net_cents(p_lines, v_inv))::text;
      end if;
      if clara._adjustment_net_cents(p_lines, v_cost) <> (case when v_amount > 0 then -v_abs else v_abs end) then
        raise exception 'the cost leg does not mirror the movement' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.cost_account_code','constraint','cost_leg',
            'account_code', v_cost, 'expected_net_cents',
            (case when v_amount > 0 then -v_abs else v_abs end),
            'actual_net_cents', clara._adjustment_net_cents(p_lines, v_cost))::text;
      end if;
    else
      -- THE WORLD: the two accounts are this client's, live, and of the class their ROLE requires.
      -- A "cost of sales" leg pointing at a liability would balance perfectly and mean nothing.
      perform clara._assert_adjustment_account(p_client, v_inv, 'asset',
        'adjustment.inventory_account_code', 'inventory_account_class');
      perform clara._assert_adjustment_account(p_client, v_cost, 'expense',
        'adjustment.cost_account_code', 'cost_account_class');
    end if;
  else
    v_exp  := btrim(coalesce(p_adjustment->>'expense_account_code',''));
    v_liab := btrim(coalesce(p_adjustment->>'liability_account_code',''));
    v_adv  := nullif(btrim(coalesce(p_adjustment->>'advance_account_code','')),'');
    v_pay  := nullif(btrim(coalesce(p_adjustment->>'payment_account_code','')),'');
    if not p_check_world then
      -- NOTHING ANONYMOUS. Every line must be on an account the particulars NAMED, so an
      -- obligation cannot smuggle an unrelated leg past a form that only shows four codes.
      v_named := array_remove(array[v_exp, v_liab, v_adv, v_pay], null);
      select btrim(coalesce(x.elem->>'account_code','')) into v_bad
        from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) as x(elem)
       where not (btrim(coalesce(x.elem->>'account_code','')) = any(v_named))
       limit 1;
      if v_bad is not null then
        raise exception 'line account % is not one of this obligation''s named accounts', v_bad
          using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch','field','lines',
            'constraint','unnamed_account','account_code', v_bad)::text;
      end if;
      -- THE COST OF THE OBLIGATION is the supplied amount, and it lands on the expense account.
      if clara._adjustment_net_cents(p_lines, v_exp) <> v_abs then
        raise exception 'the expense leg does not carry the obligation' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.expense_account_code','constraint','expense_amount',
            'account_code', v_exp, 'expected_net_cents', v_abs,
            'actual_net_cents', clara._adjustment_net_cents(p_lines, v_exp))::text;
      end if;
      -- EVERY NAMED LEG IS ACTUALLY USED. The SPLIT between the liability, a staff-advance
      -- account and a settlement leg is the ACCOUNTANT'S — this lane records supplied
      -- particulars, so it refuses a set that names an account the entry never touches and says
      -- nothing about how much belongs on each.
      --
      -- AND THE DIRECTION IS NOT PRESCRIBED, for a MEASURED reason. The first cut required each
      -- of these to be CREDITED, which reads right for an accrual and is wrong for the estate:
      -- `clara._adv_on_approve` (0043) births a staff advance from a DEBIT line on an enrolled
      -- account and refuses a CREDIT that does not say which advance it discharges (CLR40,
      -- remedy `book_staff_advance_application`). Prescribing "credited" here would have made
      -- this lane assert an accounting direction the subledger then refuses — and #643's own
      -- boundary says missing settlement facts are not invented. So the rule is "used", the
      -- amount split is the accountant's, and the staff-advance register stays the authority on
      -- what a movement on ITS accounts requires.
      if clara._adjustment_net_cents(p_lines, v_liab) = 0 then
        raise exception 'the liability leg is named but carries nothing' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.liability_account_code','constraint','liability_leg',
            'account_code', v_liab, 'actual_net_cents', 0)::text;
      end if;
      if v_adv is not null and clara._adjustment_net_cents(p_lines, v_adv) = 0 then
        raise exception 'the advance leg is named but carries nothing' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.advance_account_code','constraint','advance_leg',
            'account_code', v_adv, 'actual_net_cents', 0)::text;
      end if;
      if v_pay is not null and clara._adjustment_net_cents(p_lines, v_pay) = 0 then
        raise exception 'the payment leg is named but carries nothing' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.payment_account_code','constraint','payment_leg',
            'account_code', v_pay, 'actual_net_cents', 0)::text;
      end if;
    else
      perform clara._assert_adjustment_account(p_client, v_exp, 'expense',
        'adjustment.expense_account_code', 'expense_account_class');
      perform clara._assert_adjustment_account(p_client, v_liab, 'liability',
        'adjustment.liability_account_code', 'liability_account_class');
      if v_pay is not null then
        perform clara._assert_adjustment_account(p_client, v_pay, 'asset',
          'adjustment.payment_account_code', 'payment_account_class');
      end if;
      if v_adv is not null then
        -- THE STAFF-ADVANCE CONTROL RELATIONSHIP. `clara.staff_advance_accounts` (0043) is the
        -- estate's own register of which chart code is a staff-advance subledger and for whom;
        -- the subledger belt (`_adv_on_approve`) already guards the ledger. A payroll obligation
        -- that recovered an advance from an account NOBODY ENROLLED would be booking against a
        -- control account with no detail behind it — #643's "required account/control
        -- relationships", refused by name rather than left to the belt's generic wording.
        --
        -- …AND THE BELT REMAINS THE AUTHORITY ON WHAT THE MOVEMENT ITSELF NEEDS. This arm asks
        -- "is this account a live staff-advance enrolment of this client"; it does NOT ask which
        -- advance a credit discharges, because `clara.book_staff_advance_application` is the door
        -- that answers that and `clara._adv_on_approve` refuses CLR40 without it. A periodic
        -- adjustment may therefore name an advance account and still be refused at approve — by
        -- the register, under the register's own name, with the register's own remedy. That is
        -- the correct outcome: an allocation is a missing settlement fact, and #643 does not
        -- invent those.
        if not exists (select 1 from clara.staff_advance_accounts a
                        where a.client_id = p_client and a.account_code = v_adv and a.active) then
          raise exception 'account % is not a live staff-advance enrolment for this client', v_adv
            using errcode='CLR10',
            detail=jsonb_build_object('reason','advance_not_enrolled',
              'field','adjustment.advance_account_code','account_code', v_adv)::text;
        end if;
        perform clara._assert_adjustment_account(p_client, v_adv, 'asset',
          'adjustment.advance_account_code', 'advance_account_class');
      end if;
    end if;
  end if;

  if not p_check_world then return; end if;

  -- ---- the world half both purposes share -------------------------------------------
  --
  -- SCOPE. A periodic adjustment belongs to ONE fiscal year: a period spanning two years cannot
  -- produce one closing position, and a period running past the year end is a claim about books
  -- that are not yet written. Neither is refused by guessing — both are measured against
  -- `clara.fiscal_years`, and a client with NO year covering the period is left alone (the estate
  -- does not require a registered year to keep books, and inventing one here would be a rule this
  -- lane made up).
  select count(*)::int into v_fy_n from clara.fiscal_years fy
   where fy.client_id = p_client
     and fy.starts_on <= v_end and fy.ends_on >= v_start;
  if v_fy_n > 1 then
    raise exception 'the period % .. % spans % fiscal years', v_start, v_end, v_fy_n
      using errcode='CLR10',
      detail=jsonb_build_object('reason','scope_overbroad','field','adjustment.period_end',
        'constraint','spans_fiscal_years','fiscal_years', v_fy_n,
        'period_start', v_start, 'period_end', v_end)::text;
  end if;
  select * into v_fy from clara.fiscal_years fy
   where fy.client_id = p_client and v_start between fy.starts_on and fy.ends_on
   order by fy.starts_on desc limit 1;
  if v_fy.id is not null then
    if v_end > v_fy.ends_on then
      raise exception 'the period ends % , after fiscal year % ends %', v_end, v_fy.label, v_fy.ends_on
        using errcode='CLR10',
        detail=jsonb_build_object('reason','scope_overbroad','field','adjustment.period_end',
          'constraint','after_fiscal_year_end','fiscal_year_id', v_fy.id,
          'fy_ends_on', v_fy.ends_on, 'period_end', v_end)::text;
    end if;
    -- THE LOCKED PERIOD, TYPED AND EARLY. `t_period_wall` refuses the approved INSERT with the
    -- same CLR19 and the same reason, and stays the actual law; this arm exists so an ADMISSION
    -- into a sealed year is refused before a Work row, a run and a budget are spent on something
    -- the wall will reject seconds later.
    if v_fy.status in ('closing','closed') then
      raise exception 'fiscal year % (% to %) is %; a periodic adjustment dated in it is not admitted',
        v_fy.label, v_fy.starts_on, v_fy.ends_on, v_fy.status
        using errcode='CLR19',
        detail=jsonb_build_object('reason','write_into_closed_period','field','adjustment.period_end',
          'fiscal_year_id', v_fy.id, 'fy_status', v_fy.status,
          'period_start', v_start, 'period_end', v_end)::text;
    end if;
  end if;

  -- THE CORRECTION TARGET, when there is one. A correction FOLLOWS a reversal: the original entry
  -- must already be reversed, or the books would carry both movements at once. The estate's own
  -- `clara.reverse_entry` is the door; this arm only asks whether it has been used.
  if nullif(btrim(coalesce(p_adjustment->>'corrects_adjustment_id','')),'') is not null then
    select pa.*, je.reversed_by, je.status as entry_status into v_target
      from clara.periodic_adjustments pa
      join clara.journal_entries je on je.id = pa.entry_id
     where pa.id = (p_adjustment->>'corrects_adjustment_id')::uuid
       and pa.client_id = p_client;
    if v_target.id is null then
      raise exception 'no periodic adjustment of this client carries that id' using errcode='CLR10',
        detail=jsonb_build_object('reason','correction_target_not_found',
          'field','adjustment.corrects_adjustment_id')::text;
    end if;
    if v_target.corrected_by_adjustment_id is not null then
      raise exception 'that adjustment has already been corrected' using errcode='CLR10',
        detail=jsonb_build_object('reason','correction_target_already_corrected',
          'field','adjustment.corrects_adjustment_id',
          'adjustment_id', v_target.corrected_by_adjustment_id)::text;
    end if;
    if v_target.reversed_by is null then
      raise exception 'reverse the entry that adjustment posted before correcting it'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','correction_target_live',
          'field','adjustment.corrects_adjustment_id', 'entry_id', v_target.entry_id)::text;
    end if;
  end if;
end $$;
revoke all on function clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean) from public;

-- ONE ACCOUNT, ONE ROLE. Absent and INACTIVE answer the same way the posting core's chart check
-- does and for the same reason: neither is a postable account, and telling them apart would say
-- whether a code the caller guessed once existed. The CLASS is separate and is named, because
-- "this code exists but it is not an asset" is something a preparer can act on.
create function clara._assert_adjustment_account(p_client uuid, p_code text, p_type text,
    p_field text, p_constraint text) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_type text;
begin
  select a.account_type into v_type from clara.coa_accounts a
   where a.client_id = p_client and a.account_code = p_code and a.is_active;
  if v_type is null then
    raise exception '% codes to an account this client does not have active: %', p_field, p_code
      using errcode='CLR10',
      detail=jsonb_build_object('reason','adjustment_account_relationship','field', p_field,
        'constraint','unknown_account','account_code', p_code)::text;
  end if;
  if v_type <> p_type then
    raise exception '% must name a % account; % is a %', p_field, p_type, p_code, v_type
      using errcode='CLR10',
      detail=jsonb_build_object('reason','adjustment_account_relationship','field', p_field,
        'constraint', p_constraint, 'account_code', p_code,
        'account_type', v_type, 'expected_account_type', p_type)::text;
  end if;
end $$;
revoke all on function clara._assert_adjustment_account(uuid,text,text,text,text) from public;

-- =====================================================================================
-- §E  ADMISSION — ONE CORE, TWO PUBLIC DOORS.
--
-- THE EXTRACTION IS THE 0119 IDIOM: the public verb keeps its signature, its grant and its name,
-- and its whole body becomes ONE delegation to a private core that took a purpose and a set of
-- particulars. `clara.admit_journal_work`'s 7-argument signature does NOT move — the runtime
-- route, the FROZEN `chatTurn.v18` tool and the db battery all call it positionally, and a
-- widened signature would be a silent break in a deploy-locked closure.
--
-- WHY EXTRACT AT ALL RATHER THAN COPY. The admission body is nine authority, shape, idempotency
-- and world checks in a fixed order, three of which 0182 had to teach the difference between a
-- payload fact and a world fact the hard way. A second copy would be a second place for that
-- order to drift, and the drift would show up as a lost-response retry admitting a SECOND Work —
-- the exact failure 0182's header records.
--
-- THE CORE'S BODY IS THE PINNED 0182 TEXT with the `#643` additions marked. Nothing else changed:
-- the arm order, every refusal token, the client-scoped intent key, the two-half payload
-- comparison, the deferred filing check and the unique-violation re-read are 0182's.
-- =====================================================================================
create function clara._admit_accounting_work_core(p_client uuid, p_author uuid, p_intent_key text,
    p_purpose text, p_basis jsonb, p_adjustment jsonb, p_basis_origin text, p_source_refs jsonb,
    p_model text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_client_status text; v_role text; v_member_status text;
  v_digest text; v_work uuid; v_task uuid; v_logical text; x record;
  v_source_document uuid; v_canon_refs jsonb; v_posted_entry uuid;   -- #634
  v_canon_adj jsonb; v_canon_lines jsonb; v_audit_fn text;           -- #643
begin
  -- C82.1, FIRST: an empty or whitespace key is refused BEFORE anything durable is reached, so a
  -- blank key can never own a reservation, a Work row or a run.
  if p_intent_key is null or p_intent_key ~ '^\s*$' then
    raise exception 'an accounting-work intent requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_intent_key","constraint":"nonempty"}';
  end if;
  -- #643 · THE PURPOSE IS A CLOSED SET, checked here rather than left to the column CHECK: a
  -- 23514 out of the INSERT carries no typed reason and the runtime could not classify it.
  if p_purpose is null or p_purpose not in
       ('journal_entry','periodic_stock_adjustment','payroll_obligation') then
    raise exception 'unknown accounting-work purpose %', p_purpose using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_purpose','field','purpose')::text;
  end if;

  select c.firm_id, c.status into v_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    -- NO EXISTENCE ORACLE: an author with no membership in this firm at all gets the same answer
    -- as for a uuid that names nothing, so the pair can never be used to enumerate other firms'
    -- clients. A DEACTIVATED member of THIS firm gets the precise answer below instead: they
    -- already knew the client exists, so nothing leaks and the reason is actionable.
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the author is not an active member of this firm' using errcode='CLR04',
      detail='{"reason":"actor_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'recording a journal entry requires a bookkeeper or above' using errcode='CLR04',
      detail='{"reason":"insufficient_role"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accounting work' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;
  if p_basis_origin is null or p_basis_origin not in ('user_direct','clara_interpreted') then
    raise exception 'unknown accounting-basis origin %', p_basis_origin using errcode='CLR10',
      detail='{"reason":"invalid_basis_origin"}';
  end if;
  if p_source_refs is null or jsonb_typeof(p_source_refs) <> 'array' then
    raise exception 'source refs must be a JSON array (empty means documentless)'
      using errcode='CLR10', detail='{"reason":"invalid_source_refs"}';
  end if;
  -- #634 · EVERY ELEMENT'S SHAPE, BY NAME. The array shape above is 0178's; this is the
  -- element-level assertion that makes an evidence claim mean something. It runs BEFORE the model
  -- gate and before any durable write, for the same reason the key gate does.
  --
  -- SHAPE ONLY, HERE. The FILING check is deferred past the replay branch below — a property of
  -- the payload may be asserted against a replay, a property of the WORLD may not (see
  -- `_assert_journal_source_refs`'s own header for the lost-response path that made this a
  -- second admission).
  perform clara._assert_journal_source_refs(v_firm, p_client, p_source_refs, false);
  v_source_document := clara._journal_source_document(p_source_refs);
  -- The run records WHICH MODEL served it (C88.8's half that lives on the task). The agent_tasks
  -- INSERT guard refuses a blank snapshot with an UNTYPED CLR10, so it is refused here first,
  -- with a reason the runtime classifier can act on.
  if p_model is null or p_model ~ '^\s*$' then
    raise exception 'an accounting-work run must name the model serving it' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"model","constraint":"nonempty"}';
  end if;

  -- #643 · THE TYPED PARTICULARS' SHAPE COMES FIRST — BEFORE the journal basis, and that order is
  -- MEASURED rather than stylistic. On this lane the LINES ARE DERIVED FROM THE PARTICULARS (the
  -- form computes them; the relationship assertion below re-checks them), so a degenerate set of
  -- particulars produces a degenerate set of lines. An all-zero movement reached
  -- `clara._assert_journal_basis` first and came back
  -- `{"field":"lines[1]","constraint":"exactly_one_side"}` — true of the derived lines, useless to
  -- the preparer, and NOT the honest name #643 asks for ("all-zero proposals … refuse honestly").
  -- Asked in this order it answers `adjustment_all_zero` against `adjustment.adjustment_cents`,
  -- which is the control the human actually typed in.
  perform clara._assert_adjustment_basis(p_purpose, p_adjustment);
  v_canon_adj := clara._adjustment_basis_canonical(p_purpose, p_adjustment);

  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);
  v_canon_refs := clara._journal_source_refs_canonical(p_source_refs);   -- #634
  -- #643 · …THEN THE RELATIONSHIP TO THE LINES, still BEFORE the replay branch and before any
  -- durable write. Both halves above are properties of the PAYLOAD: what the particulars say, and
  -- whether the lines say the same thing. The WORLD half runs after the replay branch, beside
  -- 0182's filing check and for the identical reason.
  v_canon_lines := clara._journal_basis_canonical(p_basis) -> 'lines';
  perform clara._assert_adjustment_relationships(p_client, p_purpose, p_adjustment, v_canon_lines, false);

  -- Idempotent on (firm, CLIENT, intent_key). The unique constraint is what makes this safe
  -- under a genuine race; this read is the fast path and the source of the typed conflict. The
  -- client conjunct is not decoration: without it the same key used against two clients of one
  -- firm returned the FIRST client's Work as a replay and silently dropped the second intent.
  select w.id, w.basis_digest, w.logical_op_id, w.current_task_id, w.status, w.source_refs,
         w.purpose, w.adjustment_basis into x
    from clara.accounting_work w
   where w.firm_id = v_firm and w.client_id = p_client and w.intent_key = p_intent_key;
  if found then
    -- #634 · TWO PAYLOAD HALVES, TWO COMPARISONS, ONE TOKEN. The basis digest is 0178's and its
    -- formula is deliberately unchanged (see this file's header); the evidence half is compared
    -- canonical-form to canonical-form, so re-submitting the same intent with a DIFFERENT
    -- document is a typed conflict rather than a replay that silently drops the new evidence.
    --
    -- #643 · AND A THIRD HALF, ON THE SAME FOOTING. A key re-sent with the same lines but a
    -- different PERIOD, METHOD, OBLIGATION KIND or ACCOUNT ROLE is a different accounting claim;
    -- so is one re-sent under a different PURPOSE. Neither moves `basis_digest`, so without this
    -- comparison both would replay and the change would vanish.
    if x.basis_digest is distinct from v_digest
       or x.purpose is distinct from p_purpose
       or clara._journal_source_refs_canonical(x.source_refs) is distinct from v_canon_refs
       or clara._adjustment_basis_canonical(x.purpose, x.adjustment_basis) is distinct from v_canon_adj then
      raise exception 'this intent key already carries a different journal basis'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','intent_payload_conflict','work_id',x.id)::text;
    end if;
    return jsonb_build_object('work_id', x.id, 'task_id', x.current_task_id,
      'logical_op_id', x.logical_op_id, 'status', x.status, 'replayed', true);
  end if;

  -- #634 · THE WORLD'S HALF OF THE EVIDENCE CHECK, both arms, AFTER the replay branch.
  --
  -- IS THE DOCUMENT STILL AN ACTIVE VERIFIED FILING OF THIS CLIENT? Deferred to here from the
  -- shape assertion above (Codex review, confirmed): a lost-response retry under the SAME intent
  -- key must resolve to the Work it already admitted, and a filing retired in the meantime is a
  -- fact about the world rather than about the payload. Refusing it before the replay lookup sent
  -- the composer a field refusal for a Work that existed — and its next move, a different
  -- document under the same key, is a payload conflict, which rotates the key, which admits a
  -- SECOND Work for figures already admitted.
  -- The SAME assertion as above with its filing arm ON, so the refusal's `field` path and its
  -- `not_filed` constraint are generated in exactly one place rather than restated here.
  perform clara._assert_journal_source_refs(v_firm, p_client, p_source_refs, true);
  -- #643 · THE PARTICULARS' OWN WORLD HALF, here for the identical reason: an account retired, an
  -- enrolment withdrawn, a year sealed or a correction target already corrected between two
  -- attempts under one key are facts about the world, and refusing them ahead of the replay
  -- lookup would turn a lost-response retry into a second admission.
  perform clara._assert_adjustment_relationships(p_client, p_purpose, p_adjustment, v_canon_lines, true);

  -- ONE DOCUMENT, ONE POSTED ENTRY. Asked AFTER the replay branch so a replay of an
  -- already-admitted Work still replays (its own commit owns the document), and BEFORE anything
  -- durable so a conflicting attachment never mints a Work or spends a run. An attachment
  -- conflict OPENS IMPACT/CORRECTION -- the refusal carries the entry that already stands on the
  -- document -- and never becomes a second effect.
  if v_source_document is not null then
    v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
    if v_posted_entry is not null then
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_already_posted',
          'document_id', v_source_document, 'entry_id', v_posted_entry, 'conflict', true)::text;
    end if;
  end if;

  -- The id is minted HERE rather than by the column default, because the logical operation
  -- identity is derived FROM it and must land in the same INSERT (a NOT NULL column cannot wait
  -- for a follow-up UPDATE, and a placeholder would be a moment where the identity was a lie).
  --
  -- #643 · THE PURPOSE IS IN THE IDENTITY, exactly where 0178's schema left room for it
  -- (`work:<id>:<purpose>:<ordinal>`; C33.8's parser-free round trip is unaffected because every
  -- consumer compares the WHOLE STRING).
  v_work := gen_random_uuid();
  v_logical := 'work:' || v_work::text || ':' || p_purpose || ':1';
  begin
    insert into clara.accounting_work(id, firm_id, client_id, purpose, status, initiator,
        initiator_role, intent_key, logical_op_id, basis, basis_digest, basis_origin, source_refs,
        adjustment_basis)
      values (v_work, v_firm, p_client, p_purpose, 'queued', p_author, v_role, p_intent_key,
        v_logical, p_basis, v_digest, p_basis_origin, p_source_refs, p_adjustment);
  exception when unique_violation then
    -- A concurrent admission won the key. Re-read and answer as a replay if it is the SAME basis,
    -- and as the typed conflict otherwise -- never as a raw 23505 the runtime cannot classify.
    select w.id, w.basis_digest, w.logical_op_id, w.current_task_id, w.status, w.source_refs,
           w.purpose, w.adjustment_basis into x
      from clara.accounting_work w
     where w.firm_id = v_firm and w.client_id = p_client and w.intent_key = p_intent_key;
    if not found or x.basis_digest is distinct from v_digest
       or x.purpose is distinct from p_purpose
       or clara._journal_source_refs_canonical(x.source_refs) is distinct from v_canon_refs
       or clara._adjustment_basis_canonical(x.purpose, x.adjustment_basis) is distinct from v_canon_adj then
      raise exception 'this intent key already carries a different journal basis'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','intent_payload_conflict','work_id',x.id)::text;
    end if;
    return jsonb_build_object('work_id', x.id, 'task_id', x.current_task_id,
      'logical_op_id', x.logical_op_id, 'status', x.status, 'replayed', true);
  end;

  insert into clara.agent_tasks(kind, firm_id, client_id, status, created_by, model_snapshot, work_id)
    values ('accounting_work', v_firm, p_client, 'queued', p_author, p_model, v_work)
    returning id into v_task;
  update clara.accounting_work set current_task_id = v_task where id = v_work;

  -- #643 · THE AUDIT ROW NAMES THE DOOR THE CALLER USED, not the core. `auditFor('admit_journal_work')`
  -- is an existing assertion in the estate's own battery and a renamed verb would silently empty it.
  v_audit_fn := case when p_purpose = 'journal_entry' then 'admit_journal_work'
                     else 'admit_periodic_adjustment_work' end;
  perform clara._audit(v_firm, p_author, null, null, v_audit_fn, null,
    jsonb_build_object('client', p_client, 'work', v_work, 'task', v_task,
      'logical_op_id', v_logical, 'intent_key', p_intent_key, 'basis_origin', p_basis_origin,
      'source_document', v_source_document, 'purpose', p_purpose));

  return jsonb_build_object('work_id', v_work, 'task_id', v_task, 'logical_op_id', v_logical,
    'status', 'queued', 'replayed', false);
end $$;
revoke all on function clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text) from public;

-- clara.admit_journal_work — RECUT into a THIN DELEGATION. Same signature, same grant, same name,
-- same answers: everything the 0182 body did now happens inside the core above with
-- `p_purpose => 'journal_entry'` and no particulars. The body is deliberately one statement so a
-- later recut can pin it by inspection.
create or replace function clara.admit_journal_work(p_client uuid, p_author uuid, p_intent_key text,
    p_basis jsonb, p_basis_origin text, p_source_refs jsonb, p_model text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  return clara._admit_accounting_work_core(p_client, p_author, p_intent_key, 'journal_entry',
    p_basis, null, p_basis_origin, p_source_refs, p_model);
end $$;
revoke all on function clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text) from public;
grant execute on function clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text) to clara_runtime;

-- clara.admit_periodic_adjustment_work — THE SECOND PUBLIC DOOR.
--
-- It is a SIBLING of `admit_journal_work` rather than a widened version of it, and that is the
-- same choice `POST /api/work/periodic-adjustment` makes on the HTTP side: the two doors take
-- different payloads, are called by different surfaces, and one of them is named by a FROZEN chat
-- tool whose signature may not move. A single door with two optional arguments would have made
-- `p_purpose => null` a reachable state on the frozen lane.
create function clara.admit_periodic_adjustment_work(p_client uuid, p_author uuid,
    p_intent_key text, p_purpose text, p_basis jsonb, p_adjustment jsonb, p_basis_origin text,
    p_source_refs jsonb, p_model text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  -- The journal purpose has its OWN door, and sending it here would admit a Work with no
  -- particulars through a route whose whole contract is that they are present.
  if p_purpose is null or p_purpose not in ('periodic_stock_adjustment','payroll_obligation') then
    raise exception 'this door admits periodic adjustments only (got %)', p_purpose
      using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_purpose','field','purpose')::text;
  end if;
  return clara._admit_accounting_work_core(p_client, p_author, p_intent_key, p_purpose,
    p_basis, p_adjustment, p_basis_origin, p_source_refs, p_model);
end $$;
revoke all on function clara.admit_periodic_adjustment_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text) from public;
grant execute on function clara.admit_periodic_adjustment_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text) to clara_runtime;
comment on function clara.admit_periodic_adjustment_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text) is
  '#643: admit ONE periodic stock adjustment or supplied payroll obligation as durable accounting '
  'work. clara_runtime ONLY, the lane clara.admit_journal_work sits in. Idempotent on '
  '(firm, client, intent_key); the payload comparison covers the basis digest, the canonical '
  'source refs AND the canonical typed particulars.';

-- =====================================================================================
-- §F  clara._record_journal_entry_core — RECUT (the THIRD full copy). Full 0184 body; every
-- addition is marked `#643` and every pre-existing arm is carried through verbatim.
--
-- A NOTE FOR THE NEXT RECUT (#631 takes 0195 over this body): the additions below are INSERTION
-- POINTS, each one opened and closed by a `#643` comment, so a fourth copy can be derived by
-- re-applying them to a newer base rather than by reading two bodies side by side. The prestate
-- pin above is the idiom that makes that safe; keep it.
--
-- WHAT CHANGES, IN FIVE PLACES AND NO OTHERS:
--   1. the Work lookup admits all three purposes (it filtered `= 'journal_entry'`);
--   2. the typed particulars are ASSERTED — shape before `clara._reserve_op`, lines-relationship
--      straight after the basis-echo wall, world after the evidence re-read;
--   3. the reservation payload folds the canonical particulars in FOR THE NEW PURPOSES ONLY, so
--      the journal lane's payload bytes — and therefore every existing `clara.op_receipts` row —
--      are unchanged;
--   4. the draft INSERT carries `flags`, which is what the close gate reads;
--   5. a `clara.periodic_adjustments` row is written inside the posting transaction and its id
--      joins the receipt's `effects`, the Work's `result` and the answer.
--
-- A NAMED EXCEPTION TO 0182's ORDERING RULE, stated here so the next recut does not "fix" it.
-- 0182's rule is that PAYLOAD-SHAPED arms run BEFORE `clara._reserve_op` (so a malformed input
-- leaves the operation identity unspent) and WORLD-SHAPED arms after it. INSERTION 2 is
-- payload-shaped and nevertheless sits AFTER the reservation. The reason is the paragraph below;
-- the cost is measured rather than assumed: `_reserve_op` and every arm after it run inside the
-- SAME transaction as the caller, so a raise from INSERTION 2 rolls the reservation back with
-- everything else and the identity is still unspent — re-posting the same logical identity
-- afterwards behaves exactly as it does for an arm that ran before the reservation (checked
-- adversarially on rig643: a world refusal at commit leaves `clara.op_receipts` rows = 0 for that
-- identity and the same identity re-posts). INSERTION 1 — the particulars' SHAPE — does keep the
-- rule and runs before the reservation, so a malformed set never even reaches this arm.
--
-- WHY THE LINES-RELATIONSHIP ARM SITS AFTER THE BASIS-ECHO WALL rather than before the
-- reservation with the shape check. Both are payload arms, but they read DIFFERENT payloads: the
-- shape check reads `accounting_work.adjustment_basis`, a frozen column no run can touch, so it
-- is safe anywhere; the relationship check reads the ECHOED lines, and an echo that has drifted
-- from the admitted basis must be diagnosed `basis_mismatch` — the name the frozen
-- `claraWork.v1.errors.ts` roster knows — and not as a relationship failure about figures the
-- human never submitted. The echo wall is at step 5b, which is itself after the reservation
-- (5), so an arm that must follow the wall cannot precede the reservation: the two orderings are
-- in direct conflict and this one wins, because a MIS-DIAGNOSED refusal reaches the frozen
-- workflow's error roster and a spent-then-rolled-back reservation reaches nobody.
-- =====================================================================================
create or replace function clara._record_journal_entry_core(p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_work uuid, p_logical_op_id text, p_basis jsonb, p_bundle_digest text,
    p_run_id text, p_rationale text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_role text; v_member_status text; v_client_status text;
  v_canon jsonb; v_digest text; v_payload bytea; v_prior_hash bytea; v_dedupe jsonb;
  v_bad_code text; v_bad_idx int; v_lines jsonb;
  v_entry uuid; v_token uuid; v_receipt uuid; v_task uuid; v_result jsonb;
  v_source_document uuid; v_posted_entry uuid; v_effects jsonb;   -- #634
  v_task_status text;                                             -- #630
  v_adj_canon jsonb; v_flags jsonb; v_adjustment uuid; v_corrects uuid;   -- #643
begin
  -- 1 · THE WORK, inside this firm AND this client. A Work that is not this credential's is
  -- not-found, never a different error: the credential must not become an existence oracle.
  --
  -- #630 · AND IT IS LOCKED. `for update` here IS the ordering boundary between admitting this
  -- operation and cancelling the Work that authorised it (see 0184's header). A cancel that
  -- arrives from here on waits until this transaction commits or rolls back, and then reads the
  -- truth rather than racing it.
  --
  -- #643 · THE PURPOSE FILTER WIDENS. It was `= 'journal_entry'`; the three values are the
  -- column's own CHECK, restated so a purpose this core cannot post is a not-found rather than a
  -- surprise further down.
  select * into w from clara.accounting_work aw
   where aw.id = p_work and aw.firm_id = p_firm and aw.client_id = p_client
     and aw.purpose in ('journal_entry','periodic_stock_adjustment','payroll_obligation')
   for update;
  if not found then
    raise exception 'accounting work not found for this client' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;

  -- 1b · #630 · THE OTHER SIDE OF THE BOUNDARY. The lock above is only half the contract: holding
  -- it proves nobody is cancelling RIGHT NOW, and these arms ask whether somebody already did.
  -- They sit BEFORE clara._reserve_op deliberately, so a refused operation leaves the logical
  -- identity unspent and a later Retry (or a takeover) can still use it.
  --
  -- A REPLAY IS NOT AN ADMISSION, AND THIS GUARD IS WHY THE WHOLE BLOCK IS CONDITIONAL. Measured on
  -- the rig (tests/work-cancel-e2e.mjs leg 4, first cut): a run that COMMITTED and then died before
  -- checkpointing re-executes its step on respawn, reaches this core again, and found the Work
  -- `completed` -- which an unconditional `work_settled` arm refused, breaking the one idempotency
  -- guarantee 0178 was built for. The effect is already on the books; returning it changes nothing
  -- and admits nothing, so a Work that HOLDS a committed receipt falls straight through to the
  -- reservation below, which answers with the stored result and `replayed:true`.
  --
  -- CLR13 is the estate's "the state is not the one this act needs" -- the same code
  -- clara.retry_accounting_work raises for `not_retryable` and 0182 raises for `source_conflict`.
  if clara._work_committed_receipt(p_work) is null then
    if w.status in ('stopping','cancelled') then
      raise exception 'this accounting work was cancelled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_cancelled', 'status', w.status,
            'cancelled_by', (select t.cancelled_by from clara.agent_tasks t where t.id = w.current_task_id),
            'cancelled_at', (select t.cancelled_at from clara.agent_tasks t where t.id = w.current_task_id))::text;
    end if;
    if w.status in ('completed','refused','failed','expired') then
      raise exception 'this accounting work already settled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_settled', 'status', w.status)::text;
    end if;
    -- …and the RUN's own abort request, which reaches the Work through the status mirror but may be
    -- read here first by a transaction that started before the mirror's update became visible.
    select t.status into v_task_status from clara.agent_tasks t where t.id = w.current_task_id;
    if v_task_status = 'cancel_requested' then
      raise exception 'this accounting work was cancelled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_cancelled', 'status', w.status,
            'task_status', v_task_status,
            'cancelled_by', (select t.cancelled_by from clara.agent_tasks t where t.id = w.current_task_id),
            'cancelled_at', (select t.cancelled_at from clara.agent_tasks t where t.id = w.current_task_id))::text;
    end if;
  end if;

  if w.logical_op_id is distinct from p_logical_op_id then
    raise exception 'this operation identity does not belong to that accounting work'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','logical_op_mismatch',
          'expected', w.logical_op_id, 'logical_op_id', p_logical_op_id)::text;
  end if;

  -- 2 · THE HUMAN'S LIVE AUTHORITY, reread AT COMMIT and never taken from the admission
  -- snapshot. (clara.wake_context()'s own liveness predicate already refuses a credential whose
  -- on_behalf_of stopped being an active bookkeeper+, so in the deployed lane that door answers
  -- first; these two arms are the belt behind it, and they are what makes this core safe for any
  -- future caller whose credential resolution is looser.)
  --
  -- #630 · AND THE READ IS SERIALISED WITH REVOCATION, not merely fresh. `for share` on the
  -- membership row is the second half of the boundary 0184 is about: without it a revocation
  -- can commit in the window between this SELECT and the INSERT below, and the entry posts under an
  -- authority that no longer existed when the books moved -- which is exactly what C79.2
  -- ("revocation wins before a later commit") forbids. The estate's revocation writers all UPDATE
  -- this row (`clara.remove_member` / `clara.set_member_role`, 0157:331/405), and an UPDATE
  -- conflicts with FOR SHARE, so the two orders are now decided rather than raced: a revocation
  -- that arrives first makes this read see it, and one that arrives second waits for this
  -- transaction and then applies to a world where the entry is already posted (and cannot erase
  -- it -- spec §5).
  -- …AND THE FIRM ROW IS TAKEN FIRST, because the revocation writers take it first. MEASURED on
  -- the rig (work-cancel.test.mjs wc.34, first cut): `clara.set_member_role` (0157) opens with
  -- `perform 1 from clara.firms where id = c.firm for update` and only then UPDATEs the
  -- membership, while this core took the membership FOR SHARE and reached `clara.firms` LATER —
  -- through the FK key-share every `operation_receipts`/`journal_entries` insert takes. Two
  -- transactions, two orders, one cycle: PostgreSQL broke it with 40P01, and a serialization
  -- failure on a posting is precisely the answer #630 exists to make impossible. `for key share`
  -- is the weakest lock that queues behind the revocation's `for update` (and it is the same mode
  -- the FK checks below need, so it is taken once rather than twice); two postings never block
  -- each other on it.
  perform 1 from clara.firms f where f.id = p_firm for key share;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_obo and m.firm_id = p_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1
   for share;
  if v_role is null or v_member_status <> 'active' then
    raise exception 'the initiating member is no longer active in this firm' using errcode='CLR04',
      detail='{"reason":"obo_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'the initiating member no longer holds the bookkeeper floor'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  -- 2b · THE HUMAN IS THE WORK'S OWN RESPONSIBLE HUMAN, not merely SOME live bookkeeper of the
  -- firm. Reviewed finding (#623): the two arms above ask whether `p_obo` still holds authority,
  -- and the wrapper asks whether the credential is pinned to this client -- neither asks whether
  -- this is the human who ASKED for the entry. So an `interactive_client` credential minted OBO any
  -- other active bookkeeper of the firm could commit this Work, and the receipt's `on_behalf_of` --
  -- the estate's record of WHOSE AUTHORITY was rechecked -- would attribute the posting to a human
  -- who never authorised it. This is an authority check, not an input check: CLR04.
  --
  -- #630 · AND `initiator` NOW MEANS "the human this Work is executed as" (0184 §A), so after a
  -- takeover this arm binds the COLLEAGUE and refuses the person who admitted it -- which is exactly
  -- right, because they are the one who lost authority. The reason token is deliberately unchanged:
  -- `obo_not_initiator` is in the DEPLOY-LOCKED claraWork.v1.errors.ts roster and renaming it would
  -- make a run classify its own refusal as an unmapped fault.
  if p_obo is distinct from w.initiator then
    raise exception 'this operation is bound to the human who admitted it; the credential names another'
      using errcode='CLR04', detail='{"reason":"obo_not_initiator"}';
  end if;

  -- 3 · THE CLIENT, now.
  select c.status into v_client_status from clara.clients c
   where c.id = p_client and c.firm_id = p_firm;
  if v_client_status is distinct from 'active' then
    raise exception 'client is not active -- no posting' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- 4 · THE BASIS'S SHAPE, then its CANONICAL FORM — and everything below reads the canonical
  -- form, never the raw echo. THE POSTED ENTRY MUST BE THE THING THE DIGEST DESCRIBES: the
  -- runtime echoes the basis back out of its own object graph, so the text that arrives can
  -- differ in key order, in padding around an account code, in the case of the currency. The
  -- digest already forgives exactly those differences, so if the WRITE read the raw echo instead,
  -- a padded account code would satisfy the digest and then land in clara.journal_lines with its
  -- padding — a stored line disagreeing with the identity that authorised it.
  perform clara._assert_journal_basis(p_basis);
  v_canon := clara._journal_basis_canonical(p_basis);

  -- ---- #643 INSERTION 1 · THE TYPED PARTICULARS' SHAPE, from the WORK ROW ----------------
  -- Read from `w.adjustment_basis`, never from an argument: the particulars are frozen at
  -- admission and the run has no way to name them. Asserted again here rather than trusted
  -- because this core is the last door before the books move, and 0178 §D's rule — admission and
  -- commit share one definition of well-formed — applies to the particulars exactly as it does to
  -- the basis. BEFORE `clara._reserve_op`, so a malformed set leaves the identity unspent.
  perform clara._assert_adjustment_basis(w.purpose, w.adjustment_basis);
  v_adj_canon := clara._adjustment_basis_canonical(w.purpose, w.adjustment_basis);
  -- ---- #643 INSERTION 1 ends -------------------------------------------------------------

  -- 5 · IDEMPOTENCY, TYPED -- AND IT COMES BEFORE THE ADMITTED-BASIS COMPARISON.
  -- Order is behaviour here, not taste. With the comparison first, a SECOND call under an
  -- identity that already committed would answer `basis_mismatch` -- true, but the wrong
  -- diagnosis: the operative fact is that this identity ALREADY RECORDED a different payload,
  -- which is a conflict the runtime settles the Work `refused` on, not an input error it may
  -- hand back to the model. Reserving first makes the two distinguishable and BOTH reachable.
  --
  -- #643 · THE PAYLOAD GAINS THE PARTICULARS, AND ONLY FOR THE NEW PURPOSES. A journal entry's
  -- payload bytes are the 0178 shape verbatim, so every reservation and every `clara.op_receipts`
  -- row already in the estate still hashes to what it hashed to. A periodic adjustment's payload
  -- describes the WHOLE operation, because its identity is the lines AND the particulars.
  if w.adjustment_basis is null then
    v_payload := clara._hash(jsonb_build_object('client', p_client, 'basis', v_canon));
  else
    v_payload := clara._hash(jsonb_build_object('client', p_client, 'basis', v_canon,
      'adjustment', v_adj_canon));
  end if;
  select r.request_hash into v_prior_hash from clara.op_receipts r
   where r.firm_id = p_firm and r.fn = 'record_journal_entry' and r.op_key = p_logical_op_id;
  if found and v_prior_hash is distinct from v_payload then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end if;
  begin
    v_dedupe := clara._reserve_op(p_firm, 'record_journal_entry', p_logical_op_id, v_payload);
  exception when sqlstate 'CLR10' then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this operation identity is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || '{"replayed":true}'::jsonb;
  end if;

  -- 5b · THE BASIS IS THE ADMITTED BASIS. A run may echo the basis back, never author a new
  -- one: the digest is recomputed here from the ECHO and compared with the one admission stored.
  v_digest := encode(clara._hash(v_canon), 'hex');   -- identical to clara._journal_basis_digest
  if v_digest is distinct from w.basis_digest then
    raise exception 'the posted basis is not the admitted basis for this work'
      using errcode='CLR10', detail='{"reason":"basis_mismatch"}';
  end if;

  -- ---- #643 INSERTION 2 · THE LINES SAY WHAT THE PARTICULARS SAY --------------------------
  -- C-29's rung, and the reason a periodic adjustment cannot be an anonymous balancing journal.
  -- Immediately after the echo wall above, so a drifted echo is still diagnosed `basis_mismatch`
  -- (see this section's header).
  perform clara._assert_adjustment_relationships(p_client, w.purpose, w.adjustment_basis,
    v_canon -> 'lines', false);
  -- ---- #643 INSERTION 2 ends -------------------------------------------------------------

  -- 6 · THE CHART, AT COMMIT. Absent and INACTIVE answer the same way on purpose: neither is a
  -- postable account, and telling them apart would say whether a code the caller guessed once
  -- existed.
  select l.code, l.idx into v_bad_code, v_bad_idx from (
    select x.elem->>'account_code' as code, x.idx::int as idx
      from jsonb_array_elements(v_canon->'lines') with ordinality as x(elem, idx)) l
   where not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = l.code and a.is_active)
   order by l.idx limit 1;
  if v_bad_code is not null then
    raise exception 'line % codes to an account this client does not have active: %', v_bad_idx, v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','unknown_account',
        'field', 'lines[' || v_bad_idx || '].account_code', 'account_code', v_bad_code)::text;
  end if;

  -- 7 · THE CONTROL-LEG RULE. B14's ground, restated by value because the rung is an inline query
  -- inside clara._agent_post_entry_core with no extractable predicate: an open item is a claim
  -- about who owes what, a documentless generic basis is the weakest anchor in the estate, and a
  -- weak anchor may not corroborate a subledger consequence.
  --
  -- #643 · UNCHANGED, AND IT STILL BITES THE NEW PURPOSES. The CHECK on
  -- `clara.coa_accounts.account_class` admits only 'payable'/'receivable'/null (0015:199-200), so
  -- an inventory account, a statutory payable and a staff-advance account are NOT control legs by
  -- this rule and pass through — which is correct: a periodic adjustment carries typed
  -- particulars and a named producer, so it is not the weak anchor this arm exists to refuse. An
  -- adjustment that DID name a trade-payable leg is refused here exactly as a journal entry is.
  select a.account_code into v_bad_code from clara.coa_accounts a
   where a.client_id = p_client and a.account_class in ('payable','receivable')
     and a.account_code in (select x.elem->>'account_code'
                              from jsonb_array_elements(v_canon->'lines') as x(elem))
   order by a.account_code limit 1;
  if v_bad_code is not null then
    raise exception 'a generic journal entry may not carry the control-account leg %', v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','generic_control_leg',
        'account_code', v_bad_code)::text;
  end if;

  -- 7b · #634 · THE EVIDENCE, AT COMMIT. Admission checked the document; seconds or minutes pass
  -- before a run reaches this line, and in that window the filing can be retired, the document
  -- can be re-filed to another client, or a SECOND Work can post against it. The commit therefore
  -- re-reads it from the WORK'S OWN admitted refs (never from the echo) and refuses by name.
  --
  -- IT SITS AFTER THE RESERVATION ON PURPOSE. A replay of an identity that already committed
  -- returns its stored receipt at step 5 and never reaches here.
  v_source_document := clara._journal_source_document(w.source_refs);
  if v_source_document is not null then
    if not clara._journal_document_filed(p_firm, p_client, v_source_document) then
      raise exception 'the document this work cites is no longer an active verified filing of this client'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'constraint','not_filed')::text;
    end if;
    v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
    if v_posted_entry is not null then
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end if;
  end if;

  -- ---- #643 INSERTION 3 · THE PARTICULARS' WORLD, RE-READ AT COMMIT -----------------------
  -- The same shape 7b has, for the same reason: an account retired, a staff-advance enrolment
  -- withdrawn, a fiscal year sealed or the correction target corrected by somebody else between
  -- admission and this line are all facts about the world, and the run must not post through
  -- them. AFTER the reservation, so a replay of a committed identity never re-runs it.
  perform clara._assert_adjustment_relationships(p_client, w.purpose, w.adjustment_basis,
    v_canon -> 'lines', true);
  -- ---- #643 INSERTION 3 ends -------------------------------------------------------------

  -- 8 · THE RUN THIS RECEIPT BELONGS TO. `clara._wake_task_id()` is the credential-bound answer
  -- and is preferred wherever it exists; the `interactive_client` mint (0133) binds NO task, so
  -- the fallback is the Work's OWN current run. Both are SERVER-DERIVED: this core never accepts
  -- a caller-supplied task id.
  v_task := coalesce(clara._wake_task_id(), w.current_task_id);
  if v_task is null then
    raise exception 'this operation has no run to attribute its receipt to' using errcode='CLR03',
      detail='{"reason":"wake_task_unbound"}';
  end if;

  -- 9 · THE EFFECT. DRAFT THEN APPROVE, deliberately: `t_je_agent_post_receipt` is an AFTER
  -- UPDATE trigger, so a single approved INSERT would slip past the one wall that makes the
  -- receipt structural. #634: the entry's own `document_id` stays NULL even when this Work cites
  -- a document.
  --
  -- ---- #643 INSERTION 4 · THE MARKER, ON THE DRAFT INSERT ---------------------------------
  -- `flags` is written HERE and nowhere else, because `clara._tf_entry_immutable`'s
  -- approved→approved allowset is {reversed_by, reversal_reason, updated_at}: a flag added after
  -- approval would be refused, and the draft→approved UPDATE below may not carry it either. The
  -- key is the ONE the close gate has always read (`closing_stock`), and its payload is the
  -- adjustment's own period so a reader of the entry can see what the marker claims without
  -- joining anything. A payroll obligation carries `payroll_obligation` on the same footing: no
  -- gate reads it today, and an entry that moved a statutory liability should say so on its face.
  v_flags := case
    when w.purpose = 'periodic_stock_adjustment' then jsonb_build_object('closing_stock',
      jsonb_build_object('period_start', w.adjustment_basis->>'period_start',
        'period_end', w.adjustment_basis->>'period_end',
        'method', w.adjustment_basis->>'method'))
    when w.purpose = 'payroll_obligation' then jsonb_build_object('payroll_obligation',
      jsonb_build_object('period_start', w.adjustment_basis->>'period_start',
        'period_end', w.adjustment_basis->>'period_end',
        'obligation_kind', w.adjustment_basis->>'obligation_kind'))
    else '{}'::jsonb end;
  -- ---- #643 INSERTION 4 ends -------------------------------------------------------------
  v_lines := clara._validate_entry_lines(p_client, v_canon->'lines');
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor,
      flags)
    values (p_client, 'draft', (v_canon->>'posting_date')::date, v_canon->>'memo',
      'agent', clara.agent_user_id(), v_flags)
    returning id into v_entry;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents,
      description)
    select v_entry, x.idx, x.elem->>'account_code',
      (x.elem->>'debit_cents')::bigint, (x.elem->>'credit_cents')::bigint,
      x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem, idx);
  perform clara._assert_balanced(v_entry);
  update clara.journal_entries
     set status = 'approved', checker_actor = clara.agent_user_id(), approved_at = now(),
         updated_at = now()
   where id = v_entry;
  select je.revision_token into v_token from clara.journal_entries je where je.id = v_entry;

  -- #634 · the receipt NAMES ITS EVIDENCE. `entry_id` is still the effect the outcome-shape
  -- CHECK and the widened post-receipt wall read; `document_id` is added only when there is one.
  v_effects := jsonb_build_object('entry_id', v_entry, 'revision_token', v_token);
  if v_source_document is not null then
    v_effects := v_effects || jsonb_build_object('document_id', v_source_document);
  end if;
  -- #643 · …AND ITS ADJUSTMENT. The id is MINTED HERE rather than taken from the insert below,
  -- for the same reason `admit_journal_work` mints the Work id itself: `clara.operation_receipts`
  -- is append-only, the adjustment row's FK points AT the receipt, and a receipt whose `effects`
  -- named nothing until a follow-up UPDATE would be a receipt that could never name it at all.
  if w.adjustment_basis is not null then
    v_adjustment := gen_random_uuid();
    v_effects := v_effects || jsonb_build_object('adjustment_id', v_adjustment);
  end if;
  insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
      payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
      outcome, effects)
    -- #643 · the receipt's purpose IS the Work's purpose. It was the literal 'journal_entry'.
    values (p_firm, p_client, p_work, w.purpose, p_logical_op_id, encode(v_payload,'hex'),
      clara.agent_user_id(), p_obo, p_wake_kind, p_bundle_digest, p_run_id, v_task,
      'committed', v_effects)
    returning id into v_receipt;

  -- #634 · THE EVIDENCE LINK, born inside the posting transaction and naming its receipt. The
  -- SAME relation and the SAME shape the late door writes. THE INDEX'S OWN REFUSAL WEARS THE SAME
  -- NAME: a CONCURRENT sibling can post between 7b's read and this write, and then
  -- `uq_entry_evidence_links_document` is what stops the second row. Uncaught, that escaped as a
  -- raw 23505 with no `detail.reason`. A violation it cannot explain is RE-RAISED verbatim.
  if v_source_document is not null then
    begin
      insert into clara.entry_evidence_links(firm_id, client_id, entry_id, document_id, work_id,
          receipt_id, logical_op_id, attached_via, attached_by)
        values (p_firm, p_client, v_entry, v_source_document, p_work, v_receipt, p_logical_op_id,
          'work_commit', p_obo);
    exception when unique_violation then
      v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
      if v_posted_entry is null then raise; end if;
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end;
  end if;

  -- ---- #643 INSERTION 5 · THE DURABLE ADJUSTMENT ROW --------------------------------------
  -- Written INSIDE the posting transaction, beside the entry and the receipt it names, so the
  -- three are one fact or none. The particulars are stored CANONICAL — the Work row keeps the raw
  -- submission — so a reader never has to decide whether a padded code and a trimmed one are the
  -- same claim.
  if w.adjustment_basis is not null then
    v_corrects := nullif(btrim(coalesce(w.adjustment_basis->>'corrects_adjustment_id','')),'')::uuid;
    insert into clara.periodic_adjustments(id, firm_id, client_id, work_id, logical_op_id, purpose,
        period_start, period_end, basis, amount_cents, currency, entry_id, receipt_id,
        source_document_id, corrects_adjustment_id, recorded_by, on_behalf_of)
      values (v_adjustment, p_firm, p_client, p_work, p_logical_op_id, w.purpose,
        (w.adjustment_basis->>'period_start')::date, (w.adjustment_basis->>'period_end')::date,
        v_adj_canon, clara._adjustment_amount_cents(w.purpose, w.adjustment_basis),
        upper(btrim(w.adjustment_basis->>'currency')), v_entry, v_receipt,
        v_source_document, v_corrects, clara.agent_user_id(), p_obo);
    -- THE BACK-POINTER, stamped by the CORRECTING row in the same transaction — the one update
    -- `t_periodic_adjustments_append_only` admits. `uq_periodic_adjustments_corrects` is the
    -- structural half: two Works correcting one adjustment cannot both land, and the second one
    -- raises a unique violation rather than silently overwriting the first chain.
    if v_corrects is not null then
      update clara.periodic_adjustments set corrected_by_adjustment_id = v_adjustment
       where id = v_corrects and client_id = p_client;
    end if;
  end if;
  -- ---- #643 INSERTION 5 ends -------------------------------------------------------------

  -- #643 · THE ANSWER SHAPE IS ONE SHAPE PER LANE, and the key is emitted only when there IS an
  -- adjustment (adversarial migration-safety review, S2). Carried unconditionally, a fresh
  -- `journal_entry` commit answered `"adjustment_id": null` while a REPLAYED pre-0194 one — whose
  -- payload `clara._finish_op` stored before this migration existed — carried no such key at all:
  -- two shapes for one lane, distinguishable only by whether the caller happened to replay. The
  -- `||` fold is the same one `v_effects` above already uses for `document_id`, so the receipt,
  -- the Work's result and the returned answer now agree on one rule: name the effect you had.
  update clara.accounting_work
     set result = jsonb_build_object('entry_id', v_entry, 'receipt_id', v_receipt,
                                     'posted_at', now(), 'document_id', v_source_document)
                  || case when v_adjustment is null then '{}'::jsonb
                          else jsonb_build_object('adjustment_id', v_adjustment) end
   where id = p_work;

  perform clara._audit(p_firm, clara.agent_user_id(), p_obo, p_wake_kind,
    'record_journal_entry', v_entry,
    jsonb_build_object('work', p_work, 'logical_op_id', p_logical_op_id, 'run_id', p_run_id,
      'receipt', v_receipt, 'bundle_digest', p_bundle_digest, 'rationale', p_rationale,
      'document_id', v_source_document, 'purpose', w.purpose, 'adjustment_id', v_adjustment));

  -- …AND THE RETURNED ANSWER FOLLOWS THE SAME RULE as the Work's `result` above (S2).
  v_result := jsonb_build_object('posted', true, 'entry_id', v_entry, 'revision_token', v_token,
    'receipt_id', v_receipt, 'logical_op_id', p_logical_op_id, 'work_id', p_work,
    'document_id', v_source_document, 'replayed', false)
    || case when v_adjustment is null then '{}'::jsonb
            else jsonb_build_object('adjustment_id', v_adjustment) end;
  return clara._finish_op(p_firm, 'record_journal_entry', p_logical_op_id, v_result);
end $$;
revoke all on function clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text) from public;

-- =====================================================================================
-- §G  clara._close_gate_closing_stock — RECUT. Full 0056 body; `no_producer_verb` is DROPPED and
-- the producing row is NAMED.
--
-- THE GATE'S OWN INSTRUCTION, FOLLOWED. 0056 wrote: "no audited verb writes flags?'closing_stock'
-- yet, so an attestation against this gate is an interim acceptance of a MISSING INSTRUMENT …
-- Drop this key when the producer verb ships." It has shipped, above.
--
-- THE MARKER CONTRACT IS UNCHANGED, deliberately. The gate still measures
-- `je.flags ? 'closing_stock'` on a LIVE approved entry inside the FY — a bare marker planted by
-- a fixture still passes, exactly as it did, because the gate's question is "does this goods
-- trader have a closing-stock entry in the year", not "did #643's door write it". What is ADDED
-- is the PRODUCER: when the marker entry is one this lane posted, the answer names its
-- `clara.periodic_adjustments` row, its Work and the entry itself, so a close reviewer can open
-- the particulars instead of taking a boolean on trust.
--
-- THE ANSWER MOVES, AND THAT MOVES `measured_digest`. See this file's header: an attestation
-- bound to the old digest stops being effective and the firm is asked again against a gate that
-- can now be satisfied for real. Intended, user-visible, and asserted by
-- `close-closing-stock-producer.test.mjs` cs.gate.flips.
-- =====================================================================================
create or replace function clara._close_gate_closing_stock(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_fy record; v_nature text; v_present boolean; v_marker record;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  select cf.fact_value #>> '{}' into v_nature from clara.client_facts cf
    where cf.client_id = p_client and cf.fact_key = 'trade_nature'
      and cf.superseded_at is null;
  if v_nature is null then
    return jsonb_build_object('state', 'unknown', 'reason', 'trade_nature_fact_absent');
  end if;
  if v_nature = 'services' then
    return jsonb_build_object('state', 'pass', 'reason', 'not_goods_trading',
      'trade_nature', v_nature);
  end if;
  -- THE v1 MARKER CONTRACT, stated: the WD-R11 closing-stock entry carries
  -- flags ? 'closing_stock' (the Section-B fixture and #643's producer verb both write it).
  -- A goods-trader with no such approved entry dated in the FY fails this gate.
  -- LIVE entries only (Codex R1 MAJOR 3): a reversed original keeps status='approved'
  -- with reversed_by set, and its mirror carries reversal_of -- neither is a standing
  -- closing-stock declaration.
  --
  -- #643 · ONE ROW RATHER THAN A BARE `exists`, so the answer can NAME what it found. The order
  -- is total and deterministic (posting_date, then id), because `measured_digest` is an md5 of
  -- this object and a non-deterministic pick would make an unchanged world look changed on every
  -- re-measure. The left join is what keeps a bare fixture marker passing: a marker with no
  -- `clara.periodic_adjustments` row still satisfies the gate and simply names nothing.
  select je.id as entry_id, je.posting_date, pa.id as adjustment_id, pa.work_id,
         pa.period_start, pa.period_end, pa.amount_cents
    into v_marker
    from clara.journal_entries je
    left join clara.periodic_adjustments pa
      on pa.entry_id = je.id and pa.purpose = 'periodic_stock_adjustment'
   where je.client_id = p_client and je.status = 'approved'
     and je.reversed_by is null and je.reversal_of is null
     and je.posting_date between v_fy.starts_on and v_fy.ends_on
     and je.flags ? 'closing_stock'
   order by je.posting_date, je.id
   limit 1;
  v_present := v_marker.entry_id is not null;
  return jsonb_build_object(
    'state', case when v_present then 'pass' else 'fail' end,
    'trade_nature', v_nature, 'closing_stock_entry_present', v_present,
    -- #643 · THE PRODUCER, NAMED. The missing-instrument confession 0056 carried here is GONE
    -- (its key is deliberately not spelled anywhere in this body, so the tail census can prove
    -- its absence by a textual probe rather than by trusting this comment): the instrument exists
    -- (clara.admit_periodic_adjustment_work -> clara._record_journal_entry_core ->
    -- clara.periodic_adjustments), so an attestation against this gate is once again a judgement
    -- about STOCK rather than an acceptance of a missing verb. A marker with no adjustment row
    -- (a pre-#643 entry, or a fixture) reports the entry and null for the rest.
    'closing_stock_entry_id', v_marker.entry_id,
    -- …AND WHEN. `je.posting_date` was selected into `v_marker` and never emitted (adversarial
    -- migration-safety review, N2). Emitted rather than dropped: it is the one fact about the
    -- marker a close reviewer reads without opening anything — WHICH day inside the year the
    -- stock was declared — it is already the first ORDER BY key, and it costs no extra read. A
    -- marker with no adjustment row (a pre-#643 entry, or a fixture) still has one.
    'closing_stock_posted_on', v_marker.posting_date,
    'closing_stock_adjustment_id', v_marker.adjustment_id,
    'closing_stock_work_id', v_marker.work_id,
    'closing_stock_period_start', v_marker.period_start,
    'closing_stock_period_end', v_marker.period_end,
    'closing_stock_amount_cents', v_marker.amount_cents,
    'fy_starts_on', v_fy.starts_on, 'fy_ends_on', v_fy.ends_on);
end $$;
revoke all on function clara._close_gate_closing_stock(uuid, uuid) from public;

-- =====================================================================================
-- §H  THE READ. One door, viewer-floored, period-scoped.
--
-- VIEWER RATHER THAN BOOKKEEPER, unlike `clara.list_entry_links`. This is a read of the client's
-- own books in the same class as `clara.list_journal_entries` and `clara.get_close_readiness`,
-- both of which a viewer may take; the WRITE door behind the form is floored at bookkeeper, and
-- `clara.admit_periodic_adjustment_work` rechecks that floor for itself. Hiding a history table
-- from a viewer would grant and revoke nothing.
-- =====================================================================================
create function clara.list_periodic_adjustments(p_client uuid, p_from date default null,
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
    select jsonb_agg(row_to_json(r)::jsonb order by r.period_end desc, r.created_at desc)
      from (
        select pa.id, pa.work_id, pa.logical_op_id, pa.purpose,
               pa.period_start, pa.period_end, pa.basis, pa.amount_cents, pa.currency,
               pa.entry_id, je.status as entry_status, je.posting_date, je.reversed_by,
               pa.receipt_id, pa.source_document_id,
               pa.corrects_adjustment_id, pa.corrected_by_adjustment_id,
               pa.recorded_by, pa.on_behalf_of, pa.created_at
          from clara.periodic_adjustments pa
          join clara.journal_entries je on je.id = pa.entry_id
         where pa.client_id = p_client and pa.firm_id = c.firm
           and (p_from is null or pa.period_end >= p_from)
           and (p_to is null or pa.period_start <= p_to)
         order by pa.period_end desc, pa.created_at desc
         limit 500) r), '[]'::jsonb);
end $$;
revoke all on function clara.list_periodic_adjustments(uuid,date,date) from public;
grant execute on function clara.list_periodic_adjustments(uuid,date,date) to clara_authenticated;
comment on function clara.list_periodic_adjustments(uuid,date,date) is
  '#643: the client''s periodic stock adjustments and supplied payroll obligations, newest period '
  'first, with their typed particulars, exact amount, posted entry and its live/reversed state, '
  'operation receipt, source document and correction chain. Viewer+, firm+client floored, '
  'capped at 500 rows.';

reset role;

-- =====================================================================================
-- §I  TAIL CENSUS. Every claim this file made, re-READ from the committed catalog.
-- =====================================================================================
do $w643_tail$
declare v_n int; v_src text; v_def text; v_expect text;
begin
  -- (T.1) BOTH purpose vocabularies are the three values, and neither lost one.
  foreach v_def in array array['accounting_work_purpose_check','operation_receipts_purpose_check'] loop
    select pg_get_constraintdef(oid) into v_expect from pg_constraint
     where conname = v_def
       and conrelid = (case when v_def like 'accounting_work%' then 'clara.accounting_work'::regclass
                            else 'clara.operation_receipts'::regclass end);
    if v_expect is null
       or position('journal_entry' in v_expect) = 0
       or position('periodic_stock_adjustment' in v_expect) = 0
       or position('payroll_obligation' in v_expect) = 0 then
      raise exception '#643 tail: % does not carry the three purposes (%)', v_def, v_expect
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.2) THE FROZEN COLUMN, its null-iff CHECK, and its place in the immutability trigger's
  -- frozen array — read from the LIVE trigger body, never asserted from this file's own text.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='accounting_work' and column_name='adjustment_basis'
     and data_type='jsonb';
  if v_n <> 1 then
    raise exception '#643 tail: clara.accounting_work.adjustment_basis is not a jsonb column'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_work'::regclass
                    and conname='ck_accounting_work_adjustment_basis') then
    raise exception '#643 tail: the null-iff-journal_entry CHECK is absent' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._tf_accounting_work_immutable()'::regprocedure;
  if position('''adjustment_basis''' in v_src) = 0 then
    raise exception '#643 tail: adjustment_basis is not in the immutability trigger''s frozen array'
      using errcode='CLR10';
  end if;
  -- …AND 0184's OWN AUTHORITY WALL SURVIVED THE RECUT. The trigger is the only place the estate
  -- checks that a takeover hands the Work to an active bookkeeper of its own firm; a recut that
  -- dropped it would be silent.
  if position('responsible_not_authorised' in v_src) = 0 then
    raise exception '#643 tail: the recut immutability trigger LOST 0184''s initiator authority wall'
      using errcode='CLR10';
  end if;

  -- (T.3) THE TABLE: forced RLS, ZERO DML to every application role, both belts, and the two
  -- structural uniques. Read from the ACL and the catalog, grantee by grantee.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='clara' and c.relname='periodic_adjustments'
                    and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#643 tail: clara.periodic_adjustments is not RLS-forced' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from (
    select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                        'clara_wake_interactive','clara_wake_proactive']) as r) g
   where has_table_privilege(g.r, 'clara.periodic_adjustments', 'INSERT')
      or has_table_privilege(g.r, 'clara.periodic_adjustments', 'UPDATE')
      or has_table_privilege(g.r, 'clara.periodic_adjustments', 'DELETE');
  if v_n <> 0 then
    raise exception '#643 tail: % application role(s) hold DML on clara.periodic_adjustments', v_n
      using errcode='CLR10';
  end if;
  if not has_table_privilege('clara_authenticated', 'clara.periodic_adjustments', 'SELECT') then
    raise exception '#643 tail: clara_authenticated cannot read clara.periodic_adjustments'
      using errcode='CLR10';
  end if;
  if has_table_privilege('clara_runtime', 'clara.periodic_adjustments', 'SELECT') then
    raise exception '#643 tail: clara_runtime holds a read on clara.periodic_adjustments -- the run is told its effect by the wake verb'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.periodic_adjustments'::regclass and not tgisinternal
     and tgname in ('t_periodic_adjustments_append_only','t_periodic_adjustments_no_truncate');
  if v_n <> 2 then
    raise exception '#643 tail: the append-only/no-truncate belt pair is incomplete (% of 2)', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_indexes
   where schemaname='clara' and tablename='periodic_adjustments'
     and indexname in ('uq_periodic_adjustments_corrects');
  if v_n <> 1 then
    raise exception '#643 tail: uq_periodic_adjustments_corrects is absent -- two Works could correct one adjustment'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='clara.periodic_adjustments'::regclass
                   and conname='uq_periodic_adjustments_logical') then
    raise exception '#643 tail: the one-adjustment-per-logical-identity unique is absent'
      using errcode='CLR10';
  end if;
  -- EVERY CITATION CARRIES THE TENANT (S4). Read as the catalog's own constraint definitions, so
  -- a future single-column FK — the shape that would let a row cite another firm's entry, receipt
  -- or document — cannot be added without this failing. The two three-column ones are asserted by
  -- their exact text; the document one is firm-only because `clara.documents` has no client
  -- column (see §C's header).
  for v_def, v_expect in
    select * from (values
      ('fk_periodic_adjustments_entry',
       'FOREIGN KEY (entry_id, firm_id, client_id) REFERENCES clara.journal_entries(id, firm_id, client_id)'),
      ('fk_periodic_adjustments_receipt',
       'FOREIGN KEY (receipt_id, firm_id, client_id) REFERENCES clara.operation_receipts(id, firm_id, client_id)'),
      ('fk_periodic_adjustments_document',
       'FOREIGN KEY (source_document_id, firm_id) REFERENCES clara.documents(id, firm_id)')
    ) as t(name, def)
  loop
    if (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid='clara.periodic_adjustments'::regclass and conname=v_def) is distinct from v_expect then
      raise exception '#643 tail: % is not the tenant-carrying composite reference this file declared (got %)',
        v_def, (select pg_get_constraintdef(oid) from pg_constraint
                 where conrelid='clara.periodic_adjustments'::regclass and conname=v_def)
        using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conrelid='clara.operation_receipts'::regclass
                   and conname='uq_operation_receipts_id_firm_client') then
    raise exception '#643 tail: the composite unique the receipt FK references is absent from clara.operation_receipts'
      using errcode='CLR10';
  end if;
  -- THE LANE SHIPS EMPTY. A migration that arrived with rows would mean it had run somewhere else.
  select count(*)::int into v_n from clara.periodic_adjustments;
  if v_n <> 0 then
    raise exception '#643 tail: clara.periodic_adjustments is not empty (% rows)', v_n
      using errcode='CLR10';
  end if;

  -- (T.4) THE GRANT BOUNDARY, by EXACT signature. The new admission door reaches clara_runtime
  -- and NOBODY else; the read reaches clara_authenticated and nobody else; every predicate is
  -- ungranted.
  if not has_function_privilege('clara_runtime',
        'clara.admit_periodic_adjustment_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)', 'EXECUTE') then
    raise exception '#643 tail: clara_runtime cannot execute the periodic-adjustment admission door'
      using errcode='CLR10';
  end if;
  for v_def in select unnest(array['clara_authenticated','clara_agent_ro','clara_wake_interactive',
                                   'clara_wake_proactive']) loop
    if has_function_privilege(v_def,
          'clara.admit_periodic_adjustment_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)', 'EXECUTE') then
      raise exception '#643 tail: % can execute the periodic-adjustment admission door', v_def
        using errcode='CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_authenticated',
        'clara.list_periodic_adjustments(uuid,date,date)', 'EXECUTE') then
    raise exception '#643 tail: clara_authenticated cannot execute clara.list_periodic_adjustments'
      using errcode='CLR10';
  end if;
  foreach v_def in array array[
      'clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)',
      'clara._assert_adjustment_basis(text,jsonb)',
      'clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean)',
      'clara._assert_adjustment_account(uuid,text,text,text,text)',
      'clara._adjustment_basis_canonical(text,jsonb)',
      'clara._adjustment_amount_cents(text,jsonb)',
      'clara._adjustment_net_cents(jsonb,text)',
      'clara._adjustment_cents(jsonb,text,boolean,boolean)',
      'clara._adjustment_cents_value(jsonb,text)',
      'clara._adjustment_date(jsonb,text,boolean)',
      'clara._adjustment_text(jsonb,text,int,boolean)',
      'clara._tf_periodic_adjustment_append_only()'] loop
    if to_regprocedure(v_def) is null then
      raise exception '#643 tail: % does not resolve', v_def using errcode='CLR10';
    end if;
    for v_expect in select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                                        'clara_wake_interactive','clara_wake_proactive']) loop
      if has_function_privilege(v_expect, v_def, 'EXECUTE') then
        raise exception '#643 tail: % is EXECUTE-reachable by % -- it must be ungranted', v_def, v_expect
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (T.5) THE PUBLIC JOURNAL DOOR DID NOT MOVE, and it now DELEGATES. Its 7-argument signature is
  -- named by the FROZEN chatTurn.v18 tool and by the runtime route; its body is the one-statement
  -- delegation §E installed, re-read here rather than asserted.
  if to_regprocedure('clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)') is null then
    raise exception '#643 tail: clara.admit_journal_work(7) no longer resolves' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_runtime',
        'clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)', 'EXECUTE') then
    raise exception '#643 tail: clara_runtime lost EXECUTE on clara.admit_journal_work'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)'::regprocedure;
  v_expect := E'\nbegin\n  return clara._admit_accounting_work_core(p_client, p_author, p_intent_key, ''journal_entry'',\n    p_basis, null, p_basis_origin, p_source_refs, p_model);\nend ';
  if v_src <> v_expect then
    raise exception '#643 tail: clara.admit_journal_work is not the exact one-statement delegation this file installed -- got %', v_src
      using errcode='CLR10';
  end if;
  -- …and the ADMISSION LOGIC really moved rather than being duplicated: the public door holds no
  -- INSERT of its own.
  if position('insert into clara.accounting_work' in v_src) <> 0 then
    raise exception '#643 tail: clara.admit_journal_work still carries its own INSERT' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)'::regprocedure;
  foreach v_def in array array['invalid_intent_key','client_not_found','actor_not_active',
      'insufficient_role','client_inactive','invalid_basis_origin','invalid_source_refs',
      'intent_payload_conflict','source_already_posted','_assert_journal_source_refs',
      '_journal_basis_digest','_journal_source_refs_canonical'] loop
    if position(v_def in v_src) = 0 then
      raise exception '#643 tail: the extracted admission core LOST 0182''s arm/token %', v_def
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.6) THE POSTING CORE'S RECUT KEPT EVERY ARM 0184 AND 0182 PUT IN IT, and gained this
  -- file's five. Token-by-token off the LIVE body.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  foreach v_def in array array['work_not_found','work_cancelled','work_settled','logical_op_mismatch',
      'obo_not_active','insufficient_role','obo_not_initiator','client_inactive',
      'operation_payload_conflict','operation_in_flight','basis_mismatch','unknown_account',
      'generic_control_leg','source_conflict','wake_task_unbound','for key share','for share',
      '_work_committed_receipt','entry_evidence_links'] loop
    if position(v_def in v_src) = 0 then
      raise exception '#643 tail: the recut posting core LOST the arm/token %', v_def
        using errcode='CLR10';
    end if;
  end loop;
  foreach v_def in array array['_assert_adjustment_basis','_assert_adjustment_relationships',
      'periodic_adjustments','adjustment_id','corrected_by_adjustment_id','v_flags'] loop
    if position(v_def in v_src) = 0 then
      raise exception '#643 tail: the recut posting core is MISSING this file''s own addition %', v_def
        using errcode='CLR10';
    end if;
  end loop;
  -- The purpose filter widened rather than disappeared: a Work of an unknown purpose is still
  -- not-found, it is not silently postable.
  if position('aw.purpose in (''journal_entry'',''periodic_stock_adjustment'',''payroll_obligation'')' in v_src) = 0 then
    raise exception '#643 tail: the posting core''s purpose filter is not the widened closed set'
      using errcode='CLR10';
  end if;
  -- THE JOURNAL LANE'S RESERVATION PAYLOAD IS BYTE-IDENTICAL to 0178's. A recut that folded the
  -- particulars in unconditionally would re-hash every journal Work in the estate.
  if position(E'clara._hash(jsonb_build_object(''client'', p_client, ''basis'', v_canon));' in v_src) = 0 then
    raise exception '#643 tail: the journal lane''s reservation payload shape MOVED' using errcode='CLR10';
  end if;

  -- (T.7) THE CLOSE GATE dropped its confession and can name a producer.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._close_gate_closing_stock(uuid,uuid)'::regprocedure;
  if position('no_producer_verb' in v_src) <> 0 then
    raise exception '#643 tail: the closing-stock gate still confesses no_producer_verb'
      using errcode='CLR10';
  end if;
  foreach v_def in array array['trade_nature_fact_absent','not_goods_trading',
      'closing_stock_entry_present','reversed_by is null','reversal_of is null',
      'closing_stock_adjustment_id','periodic_adjustments'] loop
    if position(v_def in v_src) = 0 then
      raise exception '#643 tail: the recut closing-stock gate is missing %', v_def
        using errcode='CLR10';
    end if;
  end loop;
  -- The catalog row still points at this exact evaluator at this exact signature.
  if (select evaluator_fn from clara.close_gate_checks where check_key='closing_stock_present')
     <> 'clara._close_gate_closing_stock' then
    raise exception '#643 tail: the closing_stock_present catalog row no longer names this evaluator'
      using errcode='CLR10';
  end if;
  -- …and the gate now EMITS the marker's posting date rather than selecting it into nothing (N2).
  if position('closing_stock_posted_on' in v_src) = 0 then
    raise exception '#643 tail: the recut closing-stock gate selects je.posting_date and emits nothing'
      using errcode='CLR10';
  end if;

  -- (T.8) THE POSTURE CEREMONY, COMPLETED — owner, SECURITY DEFINER, search_path AND the exact
  -- ACL, for every function this file creates or recuts.
  --
  -- WHY THIS BLOCK EXISTS (adversarial migration-safety review, S1). The §I census above re-read
  -- prosrc and asked `has_function_privilege` grantee by grantee — which catches a MISSING or an
  -- EXTRA grant, but says nothing about the other three legs of the estate's posture. A body that
  -- shipped as INVOKER, or under the wrong owner, or without a pinned `search_path`, would pass
  -- every assertion in this file and still be a hole: a SECURITY DEFINER function with a mutable
  -- search_path is the textbook privilege-escalation shape, and a definer function owned by the
  -- wrong role runs with the wrong authority. All four legs are now read from the catalog.
  --
  -- THE ACL IS ASSERTED AS ITS EXACT TEXT rather than by privilege probes, and that is the
  -- stronger claim: `array_to_string(proacl, ',')` shows every grantee AND every grantor, so a
  -- grant made by somebody other than `clara_fn_owner` — a WITH GRANT OPTION, a grant to PUBLIC
  -- that `has_function_privilege` would report as "clara_runtime can execute" — cannot hide.
  -- Three shapes only: ungranted, +clara_runtime (the admission door), +clara_authenticated (the
  -- read). Measured live on the 0001→0187+0194 chain before it was written here.
  for v_def, v_expect in
    select * from (values
      ('clara._tf_accounting_work_immutable()', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._tf_periodic_adjustment_append_only()', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._adjustment_cents_value(jsonb,text)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._adjustment_cents(jsonb,text,boolean,boolean)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._adjustment_date(jsonb,text,boolean)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._adjustment_text(jsonb,text,int,boolean)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._assert_adjustment_basis(text,jsonb)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._adjustment_basis_canonical(text,jsonb)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._adjustment_amount_cents(text,jsonb)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._adjustment_net_cents(jsonb,text)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._assert_adjustment_account(uuid,text,text,text,text)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._close_gate_closing_stock(uuid,uuid)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)',
       'clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner'),
      ('clara.admit_periodic_adjustment_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)',
       'clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner'),
      ('clara.list_periodic_adjustments(uuid,date,date)',
       'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner')
    ) as t(sig, acl)
  loop
    if to_regprocedure(v_def) is null then
      raise exception '#643 tail: % does not resolve for the posture census', v_def using errcode='CLR10';
    end if;
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
           || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
           || coalesce(array_to_string(p.proacl, ','), '<null>')
      into v_src from pg_proc p where p.oid = to_regprocedure(v_def);
    if v_src is distinct from ('clara_fn_owner | true | search_path=clara, pg_temp | ' || v_expect) then
      raise exception '#643 tail: % has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp and ACL {%}; got {%}',
        v_def, v_expect, v_src using errcode='CLR10';
    end if;
  end loop;

  raise notice '#643 tail: OK -- both purpose CHECKs carry journal_entry + periodic_stock_adjustment + payroll_obligation and lost nothing; clara.accounting_work.adjustment_basis is a frozen jsonb column, null iff the purpose is journal_entry, inside the immutability trigger''s frozen array beside 0184''s surviving initiator authority wall; clara.periodic_adjustments ships EMPTY with forced RLS, a clara_authenticated-only SELECT (clara_runtime reaches nothing), ZERO DML to every application role, the append-only + no-truncate belts, one-adjustment-per-logical-identity and one-correction-per-target; admit_periodic_adjustment_work reaches clara_runtime and nobody else, list_periodic_adjustments reaches clara_authenticated and nobody else, and all twelve predicates/cores/triggers are EXECUTE-reachable by no application role at all; clara.admit_journal_work keeps its 7-argument signature and its grant and is now EXACTLY the one-statement delegation, with every one of 0182''s twelve admission arms re-read inside the extracted core; the posting core''s recut kept all nineteen 0184/0182 arms, gained this file''s five insertions, widened the purpose filter to the closed set and left the journal lane''s reservation payload byte-identical; and the closing-stock gate no longer confesses no_producer_verb and names the clara.periodic_adjustments row -- and the posting date -- that produced its marker. THE FOUR REVIEWED FINDINGS are re-read from the catalog too: every citation clara.periodic_adjustments makes carries its own tenant (entry and receipt against three-column composites, the document against clara.documents'' firm-only one, which is the widest that table has), so a row cannot structurally name another firm''s entry, receipt or document; the posting core emits adjustment_id ONLY when there is an adjustment, so the journal lane keeps ONE answer shape; the lines-relationship arm''s position after clara._reserve_op is a NAMED exception to 0182''s ordering rule with its reason and its measured cost stated in the section header; and all eighteen functions this file creates or recuts are re-read for owner, SECURITY DEFINER, pinned search_path and their EXACT ACL text -- grantor included -- rather than for grants alone.';
end
$w643_tail$;
