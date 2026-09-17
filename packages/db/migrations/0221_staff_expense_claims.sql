-- 0221_staff_expense_claims — #638 (refresh spec #612; journeys C1, C3, C6): STAFF EXPENSE
-- CLAIMS, EMPLOYEE PAYABLES AND ADVANCE SETTLEMENT.
-- =====================================================================================
-- Spec of record: issue #638 — "完整处理员工报销、垫款与应付明细". Domain words: CONTEXT.md —
-- "Staff expense claim", "Employee payable", "Advance application", "Accounting work",
-- "Operation receipt". Builds on 0043 (the staff-advance register), 0178 (the accounting-work
-- lane), 0182 (evidence + the source-ref predicates), 0194 (the admission core and the typed-
-- particulars precedent) and 0195 (the live posting core).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A NEW relation `clara.staff_expense_claims` (with an
-- append-only status ledger child), a NEW admission door that writes it inside the admission
-- transaction and then delegates to the UNCHANGED `clara._admit_accounting_work_core`, two NEW
-- triggers, and three NEW reads — so an employee's itemised claim becomes one complete accounting
-- act without one byte of the posting core, the purpose vocabulary or the staff-advance family
-- moving.
--
-- =====================================================================================
-- THE MEASUREMENT THAT SHAPES EVERYTHING BELOW: A FOURTH PURPOSE CANNOT POST.
--
-- The obvious design — `purpose = 'staff_expense_claim'` with typed particulars on a new frozen
-- column, exactly what #643 did for its two — is UNREACHABLE without recutting bodies this wave
-- forbids anyone to recut:
--
--   * `clara._record_journal_entry_core` looks its Work up through a CLOSED IN-list
--     (0195:1711 — `aw.purpose in ('journal_entry','periodic_stock_adjustment','payroll_obligation')`),
--     so a fourth purpose is `work_not_found` at commit, not a new lane.
--   * INSERTION 1 and 2 of that same body call `clara._assert_adjustment_basis` and
--     `clara._assert_adjustment_relationships`, both of which raise `invalid_purpose` for anything
--     outside the three (0194:587-589, :797).
--
-- SO A STAFF EXPENSE CLAIM IS A `journal_entry`-PURPOSE WORK with `adjustment_basis` NULL. The
-- live core already finds it, posts it, and correctly SKIPS #643's INSERTION 5 — `0195:2165` is
-- guarded by `if w.adjustment_basis is not null`, never by the purpose. Everything this ticket
-- needs is therefore a NEW relation, a NEW door, NEW guard functions, NEW triggers and NEW reads.
-- **#638 recuts nothing shared**, and §H below proves it by re-reading both purpose CHECK texts
-- and six pinned bodies out of the committed catalog.
--
-- WHY NOT `adjustment_basis` EITHER. Three arms of the live core are gated on that column being
-- non-null rather than on the purpose (`0195:1933`, `:1934`, `:2165-2173`), and the last of them
-- INSERTs into `clara.periodic_adjustments`, whose CHECK admits two purposes and whose
-- `period_start`/`period_end` are NOT NULL (0194:339-342). A claim has no period. Riding that
-- column would walk straight into a wrong-table INSERT the CHECK refuses.
--
-- =====================================================================================
-- THE SECOND MEASUREMENT: AN EMPLOYEE PAYABLE MAY NOT BE AN OPEN ITEM.
--
-- Four live tail assertions forbid it, and they are re-run by 0042, 0043, 0044 AND 0045:
--   * `clara.open_items` may name no advance concept (0042 tail 20(a));
--   * `counterparties_kind_check` admits no employee/staff kind (0042 tail 20(b), re-asserted at
--     0043:5473-5478, 0044:6099-6104, 0045:9373-9378);
--   * `clara.open_items.counterparty_id` is NOT NULL and its domain is `ar`/`ap` (0037:726-780);
--   * and the posting core refuses ANY payable/receivable-CLASS leg with CLR10
--     `generic_control_leg` (0195:2021-2028).
--
-- So the money owed to a claimant is a NON-CONTROL LIABILITY LEG (the starter chart's
-- `2010 Other Payables`, `account_class = null`, 0150:1503) plus `clara.staff_expense_claims` as
-- its own register. This file refuses a control-class payable leg BY ITS OWN NAME
-- (`payable_account_is_control`) at admission, because downstream it is only `generic_control_leg`
-- — true, but useless to the preparer who chose the account. §H re-asserts both 0042 walls as
-- THIS file's own claim rather than trusting review.
--
-- TODAY'S WORKAROUND POLLUTES THE VENDOR MASTER. `packages/db/tests/x37-wave-c-a-subledger.test.mjs:1998`
-- asserts that an ad-hoc claim journal births the employee as a counterparty of `kind='vendor'`
-- when the vendor field is filled. That is live contamination of exactly the surface #647's
-- counterparty hygiene exists to catch — and the argument for shipping this lane.
--
-- =====================================================================================
-- THE THIRD MEASUREMENT: THE WORK LANE DOES NOT CALL THE SUBLEDGER HOOK, AND THIS FILE DOES NOT
-- MAKE IT THE FIFTH CALLER.
--
-- `clara._adv_on_approve` runs only inside `clara._subledger_on_approve` (0043:2694, :3838), whose
-- callers 0037:3840-3845 pinned at EXACTLY FOUR by regprocedure with a fail-closed whole-schema
-- scan for a fifth.
--
-- MEASURED CORRECTION, AND IT IS A FINDING RATHER THAN A CHANGE THIS FILE MAKES. On a live
-- 0001->0198 chain that roster is SIX, not four: `clara.finalize_close` (0056, the close model's
-- own settlement entry) and `clara.reopen_fiscal_year` (0085) each `perform
-- clara._subledger_on_approve(...)`, and both landed AFTER 0037's tail ran, so nothing re-derived
-- the census. 0037's assertion is a statement about the world of 0037. Everything this file says
-- about the hook is therefore pinned to the SIX the catalog actually holds -- and #638 adds NONE
-- of them, which is the whole point: section 0 and section H assert the identical roster before
-- and after, so a seventh caller arriving with 0221 would be impossible to miss. `clara._record_journal_entry_core` is not one of them: it INSERTs
-- a draft and flips status with a bare UPDATE (0195:2098-2112). The belt, by contrast, is a
-- DEFERRED CONSTRAINT trigger firing on EVERY approved row (0043:3176) — so on the Work lane a
-- debit onto an enrolled advance account meets CLR40 `advance_movement_unregistered` and a credit
-- meets CLR40 `advance_application_missing`.
--
-- THE CLAIM LANE NEVER DEBITS AN ADVANCE ACCOUNT (every item account must be expense-class, §B),
-- so the debit half is a WALL this file leaves exactly where it stands and pins with a cell
-- (`p638.advance.debit`). #639 shares that blocker; it is not #638's to move.
--
-- THE CREDIT HALF — `settlement = 'advance_application'` — is answered by a LANE-AGNOSTIC BIRTH
-- TRIGGER (§E), the wave's own ruling (DECISIONS §1.4): a deferred constraint trigger on
-- `clara.journal_entries`, NAMED TO SORT BEFORE `t_je_adv_movement_belt`, which registers the
-- allocation idempotently from the claim row it reaches by join. It calls the SHARED temporal cap
-- `clara._adv_over_application` (0043:1220) rather than a second copy of that arithmetic, and it
-- does NOT call the hook — the census stays at the MEASURED SIX above, and §H re-derives it to
-- prove so.
--
-- THE NAME IS THE MECHANISM, not a convention. Deferred constraint-trigger events for one row are
-- QUEUED in trigger-name order at the moment of the row operation and fire at commit in queue
-- order. `t_je_adv_claim_application_birth` sorts before `t_je_adv_movement_belt` ('c' < 'm'), so
-- the allocation exists by the time the belt counts coverage. Cell `p638.advance.order` asserts
-- the pair's order out of `pg_trigger` for the day somebody renames one.
--
-- =====================================================================================
-- THE FOURTH MEASUREMENT: THE CLAIMANT IS AN ENROLMENT HANDLE, NOT A PERSON RECORD.
--
-- D4 (DECISIONS §0). `clara.staff_advance_accounts.person_label` is "a LABEL ON THE ACCOUNT, not a
-- person record" (0043:939-941) and a staff master is deferred. A free-text claimant string cannot
-- group two claims for one person — the identity-drift problem #647 owns for counterparties — so
-- the claimant on this lane IS a staff-advance enrolment, and the door AUTO-ENROLS a new claimant
-- inside the admission transaction.
--
-- AND IT CROSSES AN ADMIN FLOOR, SO IT RE-DERIVES EVERY WALL RATHER THAN CALLING THE DOOR.
-- `clara.enrol_staff_advance_account` is admin+ (`_human_ctx(clara.role_rank('admin'))`, WDB-G6)
-- and a claim is a bookkeeper's act. Calling it would either fail for every bookkeeper or require
-- lowering an adjudicated floor. So §C re-derives the four walls IN-TRANSACTION, under the SAME
-- two locks in the SAME order (the client rung, then 0041's role leaf): the account exists, is
-- client-owned and active; `confirm_dedicated` is acknowledged; the attestation satisfies 0043's
-- DELIBERATELY STRICTER-THAN-HOUSE blankness rule (0043:1990-2000 — trim the full ASCII whitespace
-- set, then refuse when nothing survives deleting whitespace and ASCII punctuation, by `translate`
-- rather than `[[:alnum:]]` so a Chinese or Tamil attestation is admitted); and the shared
-- admission predicate `clara._adv_enrolment_admission` (0043) answers `admitted`.
--
-- THE FLOOR ITSELF IS UNCHANGED, and that is the point: a bookkeeper can enrol a claimant AS PART
-- OF making a claim about that person, and still cannot call `clara.enrol_staff_advance_account`
-- directly (cell `p638.claimant.floor`). One is a claim's own particular; the other is a
-- supervisory act about what an account MEANS for every future entry.
--
-- =====================================================================================
-- THE FIFTH MEASUREMENT: TAX FACTS ARE OPAQUE SUPPLIED PARTICULARS.
--
-- There is no `tax_code` vocabulary anywhere in this estate (grep of packages/db/migrations → no
-- match); `0150:525` calls the statutory tag a "HINT, not a treatment"; `docs/PRD.md:124` defers
-- tax preparation and states that beta does not enable it. AC1 asks only that supplied tax facts
-- be CARRIED. So `items[].supplied_tax` is stored verbatim, echoed verbatim, and validated against
-- NOTHING — inventing a vocabulary to refuse against would be building the deferred lane.
--
-- =====================================================================================
-- THE SIXTH MEASUREMENT: NO SECOND HUMAN, AND PER-ITEM CONTINUATION IS DESIGNED, NOT DESCOPED.
--
-- The Work lane posts in ONE transaction with `checker_actor = clara.agent_user_id()` and never
-- calls `clara.is_high_stakes` (0195:2110-2111); `docs/PRD.md:114` rules 不以金额强制增加第二人审批.
-- This file inherits that posture and does NOT inherit `book_staff_advance_application`'s drafted
-- branch (0043:2666). Recorded as a ticket finding, not a blueprint edit: `clara.is_high_stakes`
-- is not amount-only (0004:72-78 — opening balance, year end, `tax_affecting` all fire).
--
-- PER-ITEM CONTINUATION LIVES INSIDE ONE CLAIM. `docs/PRD.md:118` defers aggregate progress ACROSS
-- many works (#636), not continuation of items inside one. An item may carry `pending_fact` — the
-- NAME of the fact it still lacks. Such an item contributes nothing to the total, posts no line,
-- and is recorded in the status ledger's `items_pending` row so the surface can say WHICH item is
-- waiting and WHY. Everything the basis structurally needs is refused BEFORE admission (#721's
-- ruling): a claim with no claimant, no incurred date or no complete item is a refusal, never an
-- admitted Work a later question could repair.
--
-- =====================================================================================
-- THE REFUSAL VOCABULARY THIS FILE OWNS. Every one carries a typed `detail.reason`; the
-- field-scoped ones carry `field` and `constraint` on the SAME footing `invalid_basis` does, so
-- `apps/web/lib/work/staff-expense-claim.ts`'s `fieldForClaimPath` maps them onto a control. The
-- `field` paths are prefixed `claim.` so they can never collide with the journal basis's own
-- (`posting_date`, `memo`, `lines[N]…`) or with #643's `adjustment.`.
--
--   CLR10 invalid_claim                  + field + constraint   shape of the claim
--   CLR10 claimant_missing               + field                no claimant handle at all
--   CLR10 claimant_not_enrolled          + field                the named enrolment is not live here
--   CLR10 incurred_date_missing          + field
--   CLR10 incurred_after_posting         + field                money spent after it was booked
--   CLR10 item_account_not_expense       + field + account_code
--   CLR10 items_do_not_sum               + field + constraint   items ≠ amount_cents
--   CLR10 claim_all_zero                 + field                a claim that claims nothing
--   CLR10 payable_account_is_control     + field + account_code the control-leg wall, by its name
--   CLR10 advance_not_enrolled           + field + account_code
--   CLR10 advance_allocation_mismatch    + field                the advance cannot carry this claim
--   CLR10 correction_target_not_found    + field
--   CLR10 correction_target_live         + field + entry_id     reverse before you correct
--   CLR10 correction_target_already_corrected + field + claim_id
--   CLR19 write_into_closed_period       + field + fiscal_year_id + fy_status
--                                          the sealed year, refused at ADMISSION rather than only
--                                          at commit — because a claim's admission writes a
--                                          DURABLE register row (see §B's world half, arm (o)).
--                                          `clara._tf_period_wall` stays the law at commit.
--   CLR39 advance_over_application       (the SHARED cap's own body, raised by §E's trigger)
--
-- THE TWO ARMS THAT RACE ARE ASKED TWICE, and only the second answer counts: `admit_...`'s step 5
-- asks the world half before any lock (a cheap refusal), step 6a asks it again UNDER the client
-- rung. That is what turns two concurrent corrections of one claim from a raw 23505 on
-- `uq_staff_expense_claims_corrects` into the typed `correction_target_already_corrected`.
--
-- INHERITED UNCHANGED: CLR04 `actor_not_active` / `insufficient_role` / `obo_not_initiator`,
-- CLR10 `client_inactive` / `invalid_intent_key` / `invalid_basis` / `intent_payload_conflict` /
-- `generic_control_leg`, CLR11 `client_not_found`, CLR13 `work_cancelled` / `source_conflict` /
-- `source_already_posted`, CLR19 `write_into_closed_period` AT COMMIT (`clara._tf_period_wall`,
-- 0056:643 — the wall this file's admission arm front-runs but never replaces), CLR40
-- `advance_application_missing` / `advance_movement_unregistered`.
--
-- LOCK ORDER. The advisory client rung (203005004) and 0041's role leaf are taken in 0043's own
-- order (`enrol_staff_advance_account`: rung, then leaf) and BEFORE the core touches
-- `clara.accounting_work` and `clara.agent_tasks` — inside the wave's
-- `accounting_plans → accounting_work → agent_tasks → agent_interruptions` order. This door
-- reserves no operation key of its own (idempotency is the core's `(firm, client, intent_key)`),
-- so the `_reserve_op`-before-the-rung rule at 0043:2605-2618 has nothing to order here.
-- =====================================================================================

do $w638_pre$
declare v_sha text; v_n int; v_def text; v_names text;
begin
  if to_regclass('clara.accounting_work') is null then
    raise exception '#638 prestate: clara.accounting_work is absent -- 0178 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.staff_advance_accounts') is null
     or to_regclass('clara.staff_advances') is null
     or to_regclass('clara.staff_advance_applications') is null then
    raise exception '#638 prestate: the staff-advance family is absent -- 0043 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.staff_expense_claims') is not null then
    raise exception '#638 prestate: clara.staff_expense_claims already exists' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)') is not null then
    raise exception '#638 prestate: a staff-expense-claim admission door already exists'
      using errcode='CLR10';
  end if;

  -- BOTH purpose CHECKs are at their 0194 THREE-VALUED form, and this file leaves them there.
  -- Measured rather than assumed: a CHECK a sibling lane had already widened would make §H's
  -- byte-identity assertion below a tautology instead of the proof it is meant to be.
  foreach v_def in array array['accounting_work_purpose_check','operation_receipts_purpose_check'] loop
    if pg_get_constraintdef((select oid from pg_constraint
          where conrelid = (case when v_def like 'accounting_work%' then 'clara.accounting_work'::regclass
                                 else 'clara.operation_receipts'::regclass end)
            and conname = v_def))
       <> 'CHECK ((purpose = ANY (ARRAY[''journal_entry''::text, ''periodic_stock_adjustment''::text, ''payroll_obligation''::text])))' then
      raise exception '#638 prestate: % is not the 0194 three-valued CHECK', v_def using errcode='CLR10';
    end if;
  end loop;

  -- THE SIX BODIES THIS FILE EDITS NONE OF, PINNED AS NON-REGRESSIONS. They are NOT recut pins:
  -- nothing below derives from their text. They exist so that applying 0221 on a chain where one
  -- of them has DRIFTED fails loudly here, instead of §H's re-assertion passing against a body
  -- this file never measured. First measured on a 0001->0198 chain (PG 17.11), never transcribed.
  -- RE-MEASURED 2026-09-17 on a 0001->0213 reference chain at the wave's re-base: THREE of the six
  -- were recut by the riders batch (PR #838) while this branch was open, so their pins are re-issued
  -- here rather than weakened -- `_record_journal_entry_core` by 0204_record_journal_entry_core_reversal_liveness
  -- (#787), `_assert_adjustment_basis` and `_assert_adjustment_relationships` by
  -- 0212_payroll_settled_cents (#797). The other three are byte-identical to the 0198 measurement.
  for v_def, v_sha in
    select * from (values
      ('clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)',
       '10b89677d342a424d5959ded8ad2c8c974c4ff9bdc26f5c0dd6c773a15af2612'),
      ('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)',
       'bc24524656e1a47812d12c4db24afde565e2aad3bb60f25d18234c05860838b3'),
      ('clara._assert_adjustment_basis(text,jsonb)',
       '69377e43cb924ad73ce87f6fd0fa26aa5c18597064b59bc88e8247fb31e2c263'),
      ('clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean)',
       'ca1510cf9d82a1ed8c87d8de94e8dbdff2f586744337bc5d477f4e7e4e687c02'),
      ('clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)',
       'ea9957fcb4fef5b578859977b1a81edf8d6bfebdaef49bd2223721d907b1a285'),
      ('clara._adv_on_approve(uuid)',
       'ddf4159f2e38b3f76005bfa5b70787b7b6aa591a410de95eb0e2717100813ac2')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_def) is null then
      raise exception '#638 prestate: % is absent', v_def using errcode='CLR10';
    end if;
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = v_def::regprocedure) <> v_sha then
      raise exception '#638 prestate: % has DRIFTED from its pinned body (sha %) -- #638 edits none of the six, so a drift here means a sibling recut landed and §H''s non-regression assertion would prove nothing',
        v_def, (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
                 where p.oid = v_def::regprocedure)
        using errcode='CLR10';
    end if;
  end loop;

  -- THE SUBLEDGER-HOOK CALLER CENSUS, at 0037:3840-3845's exact instrument but at the roster the
  -- LIVE catalog holds (SIX -- see the MEASURED CORRECTION in this file's header). Identical
  -- before this file runs and after it: #638 adds no caller.
  select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C"), '')
    into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc ~ 'clara\._subledger_on_approve *\('
     and p.oid <> 'clara._subledger_on_approve(uuid)'::regprocedure;
  if v_names <> 'clara._approve_entry_core(jsonb,uuid,uuid,text,text), '
              || 'clara._approve_opening_entry(uuid,uuid,uuid,text,integer), '
              || 'clara.approve_wrong_client_correction(uuid,text,text,text), '
              || 'clara.finalize_close(uuid,text,text), '
              || 'clara.reopen_fiscal_year(uuid,text,jsonb,text,text), '
              || 'clara.reverse_entry(uuid,text,text)' then
    raise exception '#638 prestate: the subledger hook''s callers are {%} -- expected exactly the SIX this migration measured', v_names
      using errcode='CLR10';
  end if;

  -- 0042 tail 20(a)/(b), asked BEFORE as well as after, so "the wall was already down" can never
  -- be mistaken for "this file took it down".
  select coalesce(string_agg(pg_get_constraintdef(c.oid), ' ~ '), '') into v_def
    from pg_constraint c where c.conrelid = 'clara.open_items'::regclass and c.contype = 'c';
  if position('advance' in v_def) <> 0 then
    raise exception '#638 prestate: a clara.open_items CHECK already admits an advance concept'
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'clara.counterparties'::regclass and c.conname = 'counterparties_kind_check';
  if v_def is null or position('employee' in v_def) <> 0 or position('staff' in v_def) <> 0 then
    raise exception '#638 prestate: counterparties_kind_check is gone or already admits employee/staff'
      using errcode='CLR10';
  end if;

  -- The belt this file's new trigger must sort BEFORE, and the 2010 non-control payable the
  -- reimbursement arm defaults to, both exist.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.journal_entries'::regclass and tgname = 't_je_adv_movement_belt';
  if v_n <> 1 then
    raise exception '#638 prestate: t_je_adv_movement_belt is absent -- 0043 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._adv_over_application(uuid,bigint,date,bigint,date)') is null
     or to_regprocedure('clara._adv_enrolment_admission(uuid,text,uuid)') is null
     or to_regprocedure('clara._adv_enrolment_at(uuid,text,timestamp with time zone)') is null then
    raise exception '#638 prestate: 0043''s shared advance predicates are absent' using errcode='CLR10';
  end if;

  raise notice '#638 prestate: clean -- no claim surface exists, both purpose CHECKs carry their 0194 three values, the six non-regression bodies are at their pinned texts, the subledger-hook census is the measured six, and 0042 tail 20(a)/(b) stand.';
end
$w638_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE DURABLE CLAIM AND ITS STATUS LEDGER.
--
-- WRITTEN AT ADMISSION, NOT AT POSTING, and that is the difference from `clara.periodic_adjustments`
-- (0194 §C) rather than an inconsistency with it. A periodic adjustment's particulars are read BY
-- the posting core off the Work row; a claim's particulars are read by NOBODY in the core — the
-- core sees a plain balanced `journal_entry` basis. So the claim object has to exist from the
-- moment the intent is admitted, which is also what AC1 asks for: the claimant, the itemisation
-- and the two dates are recorded whether or not the run has posted yet.
--
-- APPEND-ONLY WITH EXACTLY ONE MUTABLE COLUMN — the `clara.periodic_adjustments` /
-- `clara.entry_evidence_links` idiom. `corrected_by_claim_id` moves NULL → an id ONCE, stamped by
-- the CORRECTING row's own insert in the same transaction, so the chain is readable in both
-- directions without any row being rewritten. Everything else, and DELETE, and TRUNCATE, refuse.
--
-- EVERY FOREIGN KEY CARRIES THE TENANT (0182:320-326 / 0194 §C's S4 correction): a single-column
-- `work_id uuid references clara.accounting_work(id)` is satisfied by ANY firm's Work, and the
-- only thing preventing a cross-tenant citation would be that one function is the sole writer — a
-- property of code, not of data. `source_document_id` is NULLABLE and MATCH SIMPLE, so a
-- documentless claim skips the check entirely.
--
-- THE ENTRY AND THE RECEIPT ARE DERIVABLE BY JOIN, NEVER STORED HERE. `work_id` → the committed
-- `clara.operation_receipts` row (indexed, `ix_operation_receipts_work`) → `effects->>'entry_id'`
-- (indexed, `ix_operation_receipts_entry`). Storing them would need an UPDATE of an append-only
-- row at posting time, which is exactly the shape this table refuses. The STATUS LEDGER below is
-- where the posting moment is recorded, and it carries both ids so §E's trigger and the reads have
-- one indexed handle.
-- =====================================================================================
create table clara.staff_expense_claims (
  id                     uuid        primary key default gen_random_uuid(),
  firm_id                uuid        not null references clara.firms(id),
  client_id              uuid        not null,
  work_id                uuid        not null,
  logical_op_id          text        not null check (logical_op_id !~ '^\s*$'),
  -- THE CLAIMANT: an enrolment handle (D4), plus the label as it stood when the claim was made and
  -- an optional opaque identifier the firm uses for this person. The label is DENORMALISED on
  -- purpose: re-enrolment mints a new row (0043's version-forward rule), and a claim must keep
  -- saying whose claim it was.
  claimant_enrolment_id  uuid        not null,
  claimant_label         text        not null check (btrim(claimant_label) <> ''),
  claimant_identifier    text,
  source_kind            text        not null check (source_kind in ('document','instruction')),
  source_document_id     uuid,
  -- THE BASIS IN WORDS. Required for the same reason a documentless entry's memo is
  -- (`clara.journal_entries`' own ck_je_basis): a claim nobody explained is a figure with no reason.
  instruction            text        not null check (btrim(instruction) <> ''),
  -- TWO DATES, AND THEY ARE DIFFERENT FACTS. `incurred_date` is when the money was spent;
  -- `posting_date` is when the books say so. AC1 asks for both and forbids inventing either.
  incurred_date          date        not null,
  posting_date           date        not null,
  -- THE ITEMISATION, canonical. One element per line the preparer typed, including the PENDING
  -- ones (which carry `pending_fact` and no amount, and post nothing).
  items                  jsonb       not null
                           check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) >= 1),
  amount_cents           bigint      not null check (amount_cents > 0),
  currency               text        not null check (currency = 'MYR'),
  settlement             text        not null
                           check (settlement in ('reimbursement','advance_application','already_settled')),
  payable_account_code   text,
  advance_account_code   text,
  payment_account_code   text,
  advance_id             uuid,
  -- The canonical claim AS ADMITTED — the comparable form, so a replay never has to decide whether
  -- a padded account code and a trimmed one are the same claim.
  basis                  jsonb       not null check (jsonb_typeof(basis) = 'object'),
  corrects_claim_id      uuid        references clara.staff_expense_claims(id),
  corrected_by_claim_id  uuid        references clara.staff_expense_claims(id),
  -- `recorded_by` is the actor of record for the WRITE and `on_behalf_of` the human whose authority
  -- admitted it. On THIS door they coincide by construction: the door is actor-explicit and the
  -- runtime is not an actor of record. The pair exists because a later lane (a chat-admitted claim)
  -- can tell them apart, and a column added then could not describe rows written now.
  recorded_by            uuid        not null references clara.users(id),
  on_behalf_of           uuid        not null references clara.users(id),
  created_at             timestamptz not null default now(),
  constraint ck_staff_expense_claims_dates check (incurred_date <= posting_date),
  -- THE SETTLEMENT DECIDES WHICH LEG EXISTS, structurally. A `reimbursement` carrying an advance
  -- id would be a row whose settlement and whose consequence disagree.
  constraint ck_staff_expense_claims_settlement check (
    (settlement = 'reimbursement'
       and payable_account_code is not null and advance_account_code is null
       and advance_id is null and payment_account_code is null)
    or (settlement = 'advance_application'
       and advance_account_code is not null and advance_id is not null
       and payable_account_code is null and payment_account_code is null)
    or (settlement = 'already_settled'
       and payment_account_code is not null and payable_account_code is null
       and advance_account_code is null and advance_id is null)),
  constraint ck_staff_expense_claims_self check (
    id is distinct from corrects_claim_id and id is distinct from corrected_by_claim_id),
  constraint fk_staff_expense_claims_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_staff_expense_claims_work foreign key (work_id, firm_id, client_id)
    references clara.accounting_work(id, firm_id, client_id),
  constraint fk_staff_expense_claims_enrolment foreign key (claimant_enrolment_id, firm_id, client_id)
    references clara.staff_advance_accounts(id, firm_id, client_id),
  constraint fk_staff_expense_claims_advance foreign key (advance_id, firm_id, client_id)
    references clara.staff_advances(id, firm_id, client_id),
  -- FIRM-WIDE, because `clara.documents` has no client column: the FILING binds a document to a
  -- client, and `clara._assert_journal_source_refs` is what checks THIS client's live filing.
  constraint fk_staff_expense_claims_document foreign key (source_document_id, firm_id)
    references clara.documents(id, firm_id),
  -- ONE CLAIM PER WORK, and one per logical operation identity. The first is what makes the door's
  -- `on conflict (work_id) do nothing` a convergence rather than a race; the second is the
  -- structural half of "duplicate / lost acknowledgement / restart yields ONE effect".
  constraint uq_staff_expense_claims_work unique (work_id),
  constraint uq_staff_expense_claims_logical unique (logical_op_id),
  constraint uq_staff_expense_claims_id_firm_client unique (id, firm_id, client_id)
);
comment on table clara.staff_expense_claims is
  '#638: ONE staff expense claim -- who claimed, what was itemised, when it was incurred and when '
  'it posts, and which of reimbursement / advance application / already settled it is. Written '
  'ONLY by clara.admit_staff_expense_claim_work inside the ADMISSION transaction; append-only '
  'apart from the one-way corrected_by_claim_id stamp; no application role holds DML. The posted '
  'entry and receipt are DERIVABLE BY JOIN (work_id -> committed operation receipt -> '
  'effects->>entry_id), never stored here.';

-- ONE correction per target, structurally: two Works correcting one claim would leave the chain
-- ambiguous and the back-stamp racing itself.
create unique index uq_staff_expense_claims_corrects
  on clara.staff_expense_claims(corrects_claim_id) where (corrects_claim_id is not null);
create index ix_staff_expense_claims_client
  on clara.staff_expense_claims(client_id, posting_date desc, created_at desc);
create index ix_staff_expense_claims_claimant
  on clara.staff_expense_claims(claimant_enrolment_id, posting_date desc);
create index ix_staff_expense_claims_advance
  on clara.staff_expense_claims(advance_id) where (advance_id is not null);

alter table clara.staff_expense_claims enable row level security;
alter table clara.staff_expense_claims force row level security;
create policy p_staff_expense_claims_owner on clara.staff_expense_claims
  for all to clara_fn_owner using (true) with check (true);
create policy p_staff_expense_claims_read on clara.staff_expense_claims
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.staff_expense_claims to clara_authenticated;
-- clara_runtime gets NOTHING, exactly as it gets nothing on clara.operation_receipts and
-- clara.periodic_adjustments: the run is told its effect by the wake verb's answer, and the web
-- reads the row as the signed-in human.

create function clara._tf_staff_expense_claim_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a staff expense claim is never deleted (correct it, do not erase it)'
      using errcode='CLR08',
        detail='{"reason":"staff_expense_claim_immutable","column":"*"}';
  end if;
  -- THE ONE ADMITTED UPDATE: the correction back-pointer, NULL -> an id, once.
  if old.corrected_by_claim_id is not null or new.corrected_by_claim_id is null then
    raise exception 'a staff expense claim admits exactly one update: stamping its correction, once'
      using errcode='CLR08',
        detail='{"reason":"staff_expense_claim_immutable","column":"corrected_by_claim_id"}';
  end if;
  -- Column by column, so a future writer cannot quietly widen this by adding a SET.
  if new.id is distinct from old.id
     or new.firm_id is distinct from old.firm_id
     or new.client_id is distinct from old.client_id
     or new.work_id is distinct from old.work_id
     or new.logical_op_id is distinct from old.logical_op_id
     or new.claimant_enrolment_id is distinct from old.claimant_enrolment_id
     or new.claimant_label is distinct from old.claimant_label
     or new.claimant_identifier is distinct from old.claimant_identifier
     or new.source_kind is distinct from old.source_kind
     or new.source_document_id is distinct from old.source_document_id
     or new.instruction is distinct from old.instruction
     or new.incurred_date is distinct from old.incurred_date
     or new.posting_date is distinct from old.posting_date
     or new.items is distinct from old.items
     or new.amount_cents is distinct from old.amount_cents
     or new.currency is distinct from old.currency
     or new.settlement is distinct from old.settlement
     or new.payable_account_code is distinct from old.payable_account_code
     or new.advance_account_code is distinct from old.advance_account_code
     or new.payment_account_code is distinct from old.payment_account_code
     or new.advance_id is distinct from old.advance_id
     or new.basis is distinct from old.basis
     or new.corrects_claim_id is distinct from old.corrects_claim_id
     or new.recorded_by is distinct from old.recorded_by
     or new.on_behalf_of is distinct from old.on_behalf_of
     or new.created_at is distinct from old.created_at then
    raise exception 'a staff expense claim is append-only apart from its correction stamp'
      using errcode='CLR08',
        detail='{"reason":"staff_expense_claim_immutable","column":"*"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_staff_expense_claim_append_only() from public;
create trigger t_staff_expense_claims_append_only
  before update or delete on clara.staff_expense_claims
  for each row execute function clara._tf_staff_expense_claim_append_only();
create trigger t_staff_expense_claims_no_truncate before truncate on clara.staff_expense_claims
  for each statement execute function clara._tf_no_truncate();

-- ---------------------------------------------------------------------------------
-- THE STATUS LEDGER. Append-only, one row per (claim, state), so every stamp is idempotent by
-- construction and the whole history of one claim reads in one indexed scan.
--
-- `admitted` is written by the door. `items_pending` is written by the door when the claim carries
-- an item whose own fact is still missing. `posted` is written by §D's trigger on
-- `clara.operation_receipts` — the moment the effect becomes a fact. `reversed` is written by §D's
-- second trigger when the posted entry is reversed.
--
-- IT CARRIES `entry_id` AND `receipt_id` so §E's birth trigger and the reads have ONE indexed
-- handle from an entry back to a claim, rather than re-deriving a jsonb join every time.
-- ---------------------------------------------------------------------------------
create table clara.staff_expense_claim_status (
  id           uuid        primary key default gen_random_uuid(),
  firm_id      uuid        not null references clara.firms(id),
  client_id    uuid        not null,
  claim_id     uuid        not null,
  state        text        not null
                 check (state in ('admitted','items_pending','posted','reversed')),
  entry_id     uuid,
  receipt_id   uuid,
  detail       jsonb       not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  recorded_at  timestamptz not null default now(),
  constraint fk_staff_expense_claim_status_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_staff_expense_claim_status_claim foreign key (claim_id, firm_id, client_id)
    references clara.staff_expense_claims(id, firm_id, client_id),
  constraint uq_staff_expense_claim_status unique (claim_id, state)
);
comment on table clara.staff_expense_claim_status is
  '#638: the append-only status ledger of one staff expense claim. One row per (claim, state), so '
  'every stamp is idempotent. Written by clara.admit_staff_expense_claim_work (admitted, '
  'items_pending) and by the two triggers in 0221 section D (posted, reversed).';
create index ix_staff_expense_claim_status_entry
  on clara.staff_expense_claim_status(entry_id) where (entry_id is not null);

alter table clara.staff_expense_claim_status enable row level security;
alter table clara.staff_expense_claim_status force row level security;
create policy p_staff_expense_claim_status_owner on clara.staff_expense_claim_status
  for all to clara_fn_owner using (true) with check (true);
create policy p_staff_expense_claim_status_read on clara.staff_expense_claim_status
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.staff_expense_claim_status to clara_authenticated;

create trigger t_staff_expense_claim_status_append_only
  before update or delete on clara.staff_expense_claim_status
  for each row execute function clara._tf_append_only();
create trigger t_staff_expense_claim_status_no_truncate before truncate
  on clara.staff_expense_claim_status for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §B  THE CLAIM PREDICATES. Ungranted; shared by the door and by the reads so the two can never
-- disagree about what a well-formed claim is — 0178 §D's rule for the basis and 0194 §D's for the
-- particulars, applied a third time.
--
-- TWO CLASSES OF CHECK, AND `p_check_world` IS WHICH ONE — 0182's rule, restated. The PAYLOAD half
-- is a property of the submission and never changes: the dates, the itemisation, the arithmetic,
-- the settlement vocabulary. The WORLD half changes under the caller's feet: whether an account is
-- still active and of the right class, whether an enrolment is still live, whether the advance can
-- carry this allocation, whether the claim being corrected is still correctable. The door runs the
-- payload half BEFORE anything durable and the world half AFTER the replay branch, so a
-- lost-response retry under one intent key resolves to the Work it already admitted instead of
-- being refused for a world that moved.
--
-- THE SIGNATURE CARRIES `p_client`, AND THAT IS A DELIBERATE REFINEMENT of the brief's
-- `_assert_claim_basis(p_claim jsonb)`: the same bullet requires this function to check that the
-- claimant is a live enrolment and that every item account is expense-class, neither of which is
-- knowable from the payload alone. The NAME is the brief's; the arguments are what the named
-- checks provably need. Recorded in the ticket's report as a stated assumption.
-- =====================================================================================

-- A required non-empty supplied string, capped. `!~ '^\s*$'` rather than `btrim(...) <> ''` for
-- 0178's measured reason: one-argument btrim strips SPACES ONLY, so a tab-or-newline value would
-- have satisfied the house idiom.
create function clara._claim_text(p_obj jsonb, p_key text, p_max int, p_field text,
    p_required boolean default true) returns text
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_raw text;
begin
  v_raw := p_obj ->> p_key;
  if v_raw is null or v_raw ~ '^\s*$' then
    if not p_required then return null; end if;
    raise exception 'the claim needs %', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim','field',p_field,'constraint','nonempty')::text;
  end if;
  if char_length(btrim(v_raw)) > p_max then
    raise exception '% is % characters; the maximum is %', p_key, char_length(btrim(v_raw)), p_max
      using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim','field',p_field,'constraint','max_length',
        'max', p_max, 'length', char_length(btrim(v_raw)))::text;
  end if;
  return btrim(v_raw);
end $$;
revoke all on function clara._claim_text(jsonb,text,int,text,boolean) from public;

-- Exactly-one-integer-minor-unit with the offending PATH in the detail. `trunc(...::numeric)`
-- rather than a bare `::bigint`, for the measured reason 0178 records: jsonb keeps a number's
-- scale, so `->>` hands `48000.0` to the cast and a bare `::bigint` raises a bare 22P02 with no
-- CLR code.
create function clara._claim_cents(p_obj jsonb, p_key text, p_field text,
    p_required boolean default true) returns bigint
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_val numeric;
begin
  if p_obj -> p_key is null or jsonb_typeof(p_obj -> p_key) = 'null' then
    if not p_required then return null; end if;
    raise exception 'the claim needs %', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim','field',p_field,'constraint','present')::text;
  end if;
  if jsonb_typeof(p_obj -> p_key) <> 'number' then
    raise exception '%: minor units must be an integer JSON number', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim','field',p_field,'constraint','integer_cents')::text;
  end if;
  v_val := (p_obj ->> p_key)::numeric;
  if v_val <> trunc(v_val) or abs(v_val) > 9223372036854775807::numeric then
    raise exception '%: minor units must be a whole number', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim','field',p_field,'constraint','integer_cents')::text;
  end if;
  if v_val < 0 then
    raise exception '%: minor units must not be negative', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim','field',p_field,
        'constraint','nonnegative_integer_cents')::text;
  end if;
  return v_val::bigint;
end $$;
revoke all on function clara._claim_cents(jsonb,text,text,boolean) from public;

-- A required ISO calendar date, refused by name rather than coerced. The MISSING case carries the
-- caller's own token so `incurred_date` absent is `incurred_date_missing` rather than a generic
-- shape refusal — AC1's "do not invent missing dates" stated as a refusal the preparer can act on.
create function clara._claim_date(p_obj jsonb, p_key text, p_field text, p_missing_reason text,
    p_required boolean default true) returns date
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_raw text; v_out date;
begin
  v_raw := nullif(btrim(coalesce(p_obj ->> p_key, '')), '');
  if v_raw is null then
    if not p_required then return null; end if;
    raise exception 'the claim needs %', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason',p_missing_reason,'field',p_field,'constraint','present')::text;
  end if;
  begin
    v_out := v_raw::date;
  exception when others then
    raise exception '% is not a calendar date: %', p_key, v_raw using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim','field',p_field,'constraint','iso_date')::text;
  end;
  return v_out;
end $$;
revoke all on function clara._claim_date(jsonb,text,text,text,boolean) from public;

-- An optional uuid out of the claim, refused by name rather than coerced.
create function clara._claim_uuid(p_obj jsonb, p_key text, p_field text) returns uuid
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_raw text;
begin
  v_raw := nullif(btrim(coalesce(p_obj ->> p_key, '')), '');
  if v_raw is null then return null; end if;
  begin
    return v_raw::uuid;
  exception when others then
    raise exception '% does not name a record', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim','field',p_field,'constraint','uuid')::text;
  end;
end $$;
revoke all on function clara._claim_uuid(jsonb,text,text) from public;

/* The non-pending items' exact total, in minor units. ONE reader, so the stored `amount_cents`,
   the derived basis and the sum check can never disagree. */
create function clara._claim_item_total(p_claim jsonb) returns bigint
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select coalesce(sum(trunc((x.elem ->> 'amount_cents')::numeric))::bigint, 0)::bigint
    from jsonb_array_elements(coalesce(p_claim -> 'items', '[]'::jsonb)) as x(elem)
   where nullif(btrim(coalesce(x.elem ->> 'pending_fact','')),'') is null
     and jsonb_typeof(x.elem -> 'amount_cents') = 'number';
$$;
revoke all on function clara._claim_item_total(jsonb) from public;

/* The settlement's own credit account — the ONE leg the derived basis puts against the items. */
create function clara._claim_settlement_account(p_claim jsonb) returns text
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select nullif(btrim(coalesce(case btrim(coalesce(p_claim->>'settlement',''))
    when 'reimbursement'       then p_claim ->> 'payable_account_code'
    when 'advance_application' then p_claim ->> 'advance_account_code'
    when 'already_settled'     then p_claim ->> 'payment_account_code'
    else null end, '')), '');
$$;
revoke all on function clara._claim_settlement_account(jsonb) from public;

-- THE SHAPE OF ONE CLAIM, field-scoped exactly as `clara._assert_journal_basis` and
-- `clara._assert_adjustment_basis` are.
create function clara._assert_claim_basis(p_client uuid, p_claim jsonb,
    p_check_world boolean default true) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  e record; v_settlement text; v_incurred date; v_posting date; v_amount bigint;
  v_total bigint; v_n int; v_live int; v_code text; v_class text; v_type text;
  v_enrol uuid; v_claimant jsonb; v_credit text; v_firm uuid;
  v_target_id uuid; v_target_corrected uuid; v_target_entry uuid; v_target_reversed uuid;
  v_advance uuid; v_cap jsonb; v_fy record;
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
  -- ORDER IS MEASURED, not stylistic. A zero claim reaching the itemisation first answers
  -- "items do not sum", which is true of the derived arithmetic and useless to the preparer; asked
  -- in this order it answers `claim_all_zero` against the total they typed.
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
    -- A PENDING ITEM carries the NAME of the fact it still lacks and NO amount. It posts nothing
    -- and contributes nothing; the status ledger says which item is waiting and why (AC3's
    -- per-item continuation, designed inside one claim -- #636 defers aggregation across works,
    -- not this).
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
    -- EVERY ITEM ACCOUNT IS AN EXPENSE ACCOUNT OF THIS CLIENT. A world fact: the chart moves.
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

  -- ---- THE SETTLEMENT AND ITS ONE CREDIT LEG ------------------------------------------------
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
  -- THE SETTLEMENT LEG MAY NOT REPEAT AN ITEM'S OWN ACCOUNT: an entry that debits and credits one
  -- account for the same claim says nothing.
  if exists (select 1 from jsonb_array_elements(p_claim -> 'items') as x(elem)
              where nullif(btrim(coalesce(x.elem ->> 'pending_fact','')),'') is null
                and btrim(coalesce(x.elem ->> 'expense_account_code','')) = v_credit) then
    raise exception 'the settlement leg repeats an item''s own account (%)', v_credit
      using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim','field','claim.settlement',
        'constraint','distinct','account_code',v_credit)::text;
  end if;
  perform clara._claim_uuid(p_claim, 'corrects_claim_id', 'claim.corrects_claim_id');

  if not p_check_world then return; end if;

  -- =========================================================================================
  -- THE WORLD HALF. Everything below can change between two attempts under one intent key.
  -- =========================================================================================
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;

  -- (o) THE LOCKED PERIOD, TYPED AND EARLY — the arm `clara._assert_adjustment_relationships`
  -- already raises for a periodic adjustment (0194:975-983), restated here because A CLAIM IS MORE
  -- EXPOSED THAN A PLAIN JOURNAL WORK. A journal Work admitted into a sealed year leaves an
  -- unpostable Work the Work list shows as refused; a CLAIM's admission also writes a DURABLE
  -- REGISTER ROW (clara.staff_expense_claims + its status ledger, both append-only), so refusing
  -- only at posting would leave a permanent claim the register cannot tell apart from one still
  -- queued — `entry_id` null, ledger `['admitted']`, for ever.
  --
  -- `clara._tf_period_wall` (0056:643) stays THE LAW: it refuses the approved INSERT seconds later
  -- with the same CLR19 and the same reason, and it is the only half that sees a permit. This arm
  -- exists so nothing durable is spent on a posting the wall will refuse. The ordering preference
  -- below is the wall's own (a sealed year wins if contiguity ever admitted two matches).
  --
  -- A year that closes BETWEEN admission and posting still refuses at COMMIT, and that residual is
  -- deliberate and unavoidable: the claim was admitted into an open year. The register shows it as
  -- an admitted-never-posted claim, which is the truth about it.
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
    -- THE EMPLOYEE PAYABLE IS A NON-CONTROL LIABILITY, refused HERE by its own name because
    -- downstream the posting core can only say `generic_control_leg` (0195:2021-2028) -- true, and
    -- useless to the preparer who chose the account. `2010 Other Payables` is the starter chart's
    -- own (0150:1503); `2000 Trade Payables Control` is not, and an employee may not be a
    -- counterparty at all (0042 tail 20(b)).
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
    -- (iii) THE ADVANCE ARM: the account is ENROLLED, the advance is real and this client's, and
    -- the SHARED temporal cap admits the allocation. Asked here so the refusal reaches the
    -- preparer at the form rather than aborting a commit inside §E's deferred trigger.
    if clara._adv_enrolment_at(p_client, v_credit, now()) is null then
      raise exception 'no live staff-advance enrolment carries %', v_credit using errcode='CLR10',
        detail=jsonb_build_object('reason','advance_not_enrolled',
          'field','claim.advance_account_code','account_code',v_credit)::text;
    end if;
    v_advance := clara._claim_uuid(p_claim, 'advance_id', 'claim.advance_id');
    if v_advance is null then
      raise exception 'an advance application names WHICH advance it discharges -- there is NO silent FIFO in this register (WD-R10)'
        using errcode='CLR10',
        detail='{"reason":"advance_allocation_mismatch","field":"claim.advance_id","constraint":"present"}';
    end if;
    if not exists (select 1 from clara.staff_advances sa
                    where sa.id = v_advance and sa.client_id = p_client
                      and sa.account_code = v_credit) then
      raise exception 'that advance is not one this client holds on %', v_credit
        using errcode='CLR10',
        detail=jsonb_build_object('reason','advance_allocation_mismatch','field','claim.advance_id',
          'constraint','not_this_client','advance_id',v_advance)::text;
    end if;
    -- The SHARED cap (0043:1220), asked rather than re-derived: the arithmetic a refusal reports
    -- and the arithmetic §E enforces are the same bytes.
    v_cap := clara._adv_over_application(v_advance, v_amount, v_posting);
    if v_cap is not null then
      raise exception 'that advance cannot carry this claim: % cents outstanding at %, % claimed',
        v_cap->>'outstanding_cents', v_cap->>'boundary_date', v_amount using errcode='CLR10',
        detail=(v_cap || jsonb_build_object('reason','advance_allocation_mismatch',
          'field','claim.amount_cents','constraint','over_application'))::text;
    end if;
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

-- ONLY EVER CALLED ON A VALIDATED CLAIM. The comparison half of the intent-payload conflict —
-- 0182's second half and 0194's third, minted a fourth time here. Re-submitting one intent key with
-- the same DERIVED basis but a different claimant, itemisation, incurred date or settlement is a
-- typed conflict rather than a replay that silently drops the change.
create function clara._claim_basis_canonical(p_claim jsonb) returns jsonb
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
      'advance_id', lower(nullif(btrim(coalesce(p_claim->>'advance_id','')),'')),
      'corrects_claim_id', lower(nullif(btrim(coalesce(p_claim->>'corrects_claim_id','')),'')),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'description', btrim(coalesce(x.elem->>'description','')),
                 'expense_account_code', nullif(btrim(coalesce(x.elem->>'expense_account_code','')),''),
                 'amount_cents', case when jsonb_typeof(x.elem->'amount_cents') = 'number'
                                      then trunc((x.elem->>'amount_cents')::numeric)::bigint end,
                 -- SUPPLIED TAX FACTS RIDE VERBATIM. No vocabulary exists to validate them against
                 -- (0150:525 calls the statutory tag a hint; PRD:124 defers tax), and AC1 asks only
                 -- that they be carried.
                 'supplied_tax', x.elem -> 'supplied_tax',
                 'incurred_date', nullif(btrim(coalesce(x.elem->>'incurred_date','')),''),
                 'pending_fact', nullif(btrim(coalesce(x.elem->>'pending_fact','')),''))
                 order by x.idx)
          from jsonb_array_elements(coalesce(p_claim->'items','[]'::jsonb))
            with ordinality as x(elem, idx)), '[]'::jsonb))
  end;
$$;
revoke all on function clara._claim_basis_canonical(jsonb) from public;

/**
 * THE JOURNAL BASIS A CLAIM IMPLIES — the `p_basis` argument of the admission core.
 *
 * IT IS A DERIVATION, NOT A PROPOSAL, and it is the ONLY place the lines are decided: the preparer
 * types particulars, never legs. Each non-pending item is one expense DEBIT; the settlement is the
 * ONE credit. `already_settled` is NOT "no journal": the expense debits land against the stated
 * payment account, so a settlement producing one leg is a refusal (§B), never a shortcut.
 *
 * THE MEMO IS THE INSTRUCTION, capped at the frozen tool schema's 4000, and each line's narration
 * is the item's own description capped at 2000 — the two caps `clara._assert_journal_basis`
 * restates from `claraWork.v3.tools.ts`, so a claim can never be admitted-but-unpostable.
 */
create function clara._claim_journal_basis(p_claim jsonb) returns jsonb
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
      || jsonb_build_array(jsonb_build_object(
           'account_code', clara._claim_settlement_account(p_claim),
           'debit_cents', 0,
           'credit_cents', trunc((coalesce(nullif(p_claim->>'amount_cents',''),'0'))::numeric)::bigint,
           'description', btrim(coalesce(p_claim->>'settlement','')))));
$$;
revoke all on function clara._claim_journal_basis(jsonb) from public;

-- =====================================================================================
-- §C  THE CLAIMANT RESOLVER AND THE PUBLIC DOOR.
-- =====================================================================================

/**
 * RESOLVE-OR-ENROL, and it is IDEMPOTENT BY CONSTRUCTION: a live enrolment on the named code is
 * REUSED, so a lost-response retry under one intent key never mints a second enrolment for one
 * person. Only a code with no live enrolment is enrolled, and only after every 0043 wall is
 * re-derived here.
 *
 * WHY NOT CALL `clara.enrol_staff_advance_account`. It is admin+ (WDB-G6) and a claim is a
 * bookkeeper's act, so calling it would either refuse every bookkeeper or require lowering an
 * adjudicated floor. The floor stays exactly where it is — a bookkeeper still cannot call that door
 * (cell `p638.claimant.floor`) — and this body re-derives its four walls instead, under the SAME
 * two locks the caller has already taken in 0043's own order.
 *
 * THE ATTESTATION RULE IS 0043's, NOT THE HOUSE ONE, copied deliberately (0043:1990-2000): trim the
 * FULL ASCII whitespace set, then refuse when nothing survives deleting whitespace and ASCII
 * punctuation, using `translate` rather than `[[:alnum:]]` because that class is locale-dependent
 * and would refuse a Chinese or Tamil attestation on one rig and admit it on another.
 */
create function clara._claim_resolve_claimant(p_client uuid, p_author uuid, p_claim jsonb,
    p_intent_key text) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_claimant jsonb; v_enrol uuid; v_code text; v_label text; v_attest text;
  v_adm jsonb; v_id uuid;
begin
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  v_claimant := p_claim -> 'claimant';
  v_enrol := clara._claim_uuid(v_claimant, 'enrolment_id', 'claim.claimant.enrolment_id');
  if v_enrol is not null then
    -- Re-read under the locks the caller holds: §B checked it, and this is the moment it is used.
    if not exists (select 1 from clara.staff_advance_accounts sa
                    where sa.id = v_enrol and sa.client_id = p_client and sa.active) then
      raise exception 'that claimant is not a live staff-advance enrolment of this client'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','claimant_not_enrolled',
          'field','claim.claimant.enrolment_id','enrolment_id',v_enrol)::text;
    end if;
    return v_enrol;
  end if;

  v_code := nullif(btrim(coalesce(v_claimant ->> 'account_code','')), '');
  select sa.id into v_id from clara.staff_advance_accounts sa
   where sa.client_id = p_client and sa.account_code = v_code and sa.active;
  if v_id is not null then return v_id; end if;

  -- ---- THE AUTO-ENROLMENT: every 0043 wall, re-derived ------------------------------------
  v_label := nullif(btrim(coalesce(v_claimant ->> 'person_label','')), '');
  if v_label is null then
    raise exception 'a new claimant needs the name the register will carry -- the account is dedicated to ONE person and the register says who'
      using errcode='CLR10',
      detail='{"reason":"claimant_missing","field":"claim.claimant.person_label","constraint":"nonempty"}';
  end if;
  v_attest := nullif(btrim(coalesce(v_claimant ->> 'attestation',''), E' \t\n\r\f\v'), '');
  if v_attest is null
     or translate(v_attest, E' \t\n\r\f\v' || '!"#$%&''()*+,-./:;<=>?@[\]^_`{|}~', '') = '' then
    raise exception 'enrolling a new claimant needs a written attestation (who this account is for, and whether the balance is a related-party balance)'
      using errcode='CLR10',
      detail='{"reason":"claimant_missing","field":"claim.claimant.attestation","constraint":"attestation"}';
  end if;
  if coalesce((v_claimant ->> 'confirm_dedicated')::boolean, false) is not true then
    raise exception 'confirm that % is DEDICATED to this one person: the register''s tie-out is meaningless on a mixed account', v_code
      using errcode='CLR10',
      detail=jsonb_build_object('reason','claimant_missing',
        'field','claim.claimant.confirm_dedicated','constraint','confirm_dedicated',
        'account_code',v_code)::text;
  end if;

  -- 0043's OWN shared admission predicate, ENFORCED rather than re-implemented: typing, the bank
  -- door, the reserved-role union and enrol-clean-only, in one body, read under the locks the
  -- caller holds.
  v_adm := clara._adv_enrolment_admission(p_client, v_code, null);
  if not (v_adm ->> 'admitted')::boolean then
    raise exception '%', v_adm ->> 'message' using errcode='CLR10',
      detail=(coalesce(v_adm -> 'detail','{}'::jsonb)
              || jsonb_build_object('field','claim.claimant.account_code'))::text;
  end if;

  insert into clara.staff_advance_accounts(firm_id, client_id, account_code, person_label,
      enrolment_attestation, active, enrolled_at, created_by, created_op_key)
    values (v_firm, p_client, v_code, v_label, v_attest, true, now(), p_author,
      'staff_expense_claim:' || p_intent_key)
    returning id into v_id;

  perform clara._audit(v_firm, p_author, null, null, 'admit_staff_expense_claim_work', null,
    jsonb_build_object('client', p_client, 'enrolled_account_code', v_code,
      'person_label', v_label, 'attestation', v_attest, 'enrolment_id', v_id,
      'via', 'claim_auto_enrolment'));
  return v_id;
end $$;
revoke all on function clara._claim_resolve_claimant(uuid,uuid,jsonb,text) from public;

/**
 * clara.admit_staff_expense_claim_work — THE THIRD PUBLIC ADMISSION DOOR.
 *
 * A SIBLING of `clara.admit_periodic_adjustment_work` (0194:1298-1314) in every respect that
 * matters: `security definer`, actor-explicit (`p_author` is the AUTHORISING HUMAN; membership,
 * role ≥ bookkeeper and client status are rechecked inside the core), `revoke all … from public`,
 * `grant execute … to clara_runtime`.
 *
 * WHY `clara_runtime` AND NOT A `clara_authenticated` TWIN. Work admission on this lane is a
 * runtime act OBO a named human — 0194:1316-1318 grants exactly that — and the human form goes
 * through `POST /api/work/staff-expense-claim`, a literal sibling of `workRoutes.ts:701`. A second
 * door with a different authority model would be a second answer to "who admitted this".
 *
 * BODY ORDER, AND EVERY STEP IS THERE FOR A MEASURED REASON:
 *   1. the intent key, first, so a blank key can never own an enrolment or a Work;
 *   2. the claim's PAYLOAD half, before anything durable;
 *   3. the authority preamble (the core re-checks it, but the auto-enrolment below is durable and
 *      must never happen for a caller the core would refuse);
 *   4. the REPLAY probe -- a Work already under this key resolves to its claim, and the world half
 *      is NOT re-asked (0182's lesson: a property of the world may not refuse a lost-response
 *      retry);
 *   5. the claim's WORLD half;
 *   6. the claimant, resolved-or-enrolled under the client rung and 0041's role leaf;
 *   7. the UNCHANGED `clara._admit_accounting_work_core` with `purpose => 'journal_entry'` and
 *      `p_adjustment => null`;
 *   8. the claim row and its status ledger, `on conflict (work_id) do nothing` so the core's own
 *      replay branch converges here too instead of raising.
 */
create function clara.admit_staff_expense_claim_work(p_client uuid, p_author uuid,
    p_intent_key text, p_claim jsonb, p_basis_origin text, p_source_refs jsonb, p_model text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_client_status text; v_role text; v_member_status text;
  v_canon jsonb; v_basis jsonb; v_res jsonb; v_work uuid; v_claim uuid;
  v_enrol uuid; v_label text; v_settlement text; v_credit text; v_corrects uuid;
  v_doc uuid; v_pending jsonb; v_prior_claim uuid; v_prior_basis jsonb;
begin
  -- 1 · THE KEY, FIRST (C82.1).
  if p_intent_key is null or p_intent_key ~ '^\s*$' then
    raise exception 'a staff-expense-claim intent requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_intent_key","constraint":"nonempty"}';
  end if;

  -- 2 · THE PAYLOAD HALF.
  perform clara._assert_claim_basis(p_client, p_claim, false);
  v_canon := clara._claim_basis_canonical(p_claim);

  -- 3 · THE AUTHORITY PREAMBLE. The core asks these again; they are asked HERE because step 6
  -- writes durably and must never run for a caller the core would refuse. The arms, their order
  -- and their tokens are the core's own (0194:1089-1116), so the two can never disagree.
  select c.firm_id, c.status into v_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    -- NO EXISTENCE ORACLE, the core's own rule.
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

  -- 4 · THE REPLAY PROBE. A Work already under this key resolves to the claim it carries; the
  -- world half below is deliberately NOT re-asked.
  select w.id into v_work from clara.accounting_work w
   where w.firm_id = v_firm and w.client_id = p_client and w.intent_key = p_intent_key;
  if v_work is not null then
    select sec.id, sec.basis into v_prior_claim, v_prior_basis
      from clara.staff_expense_claims sec where sec.work_id = v_work;
    if v_prior_claim is null then
      -- The key belongs to a Work that is NOT a claim. Answering "replayed" would hand the caller
      -- a Work whose basis is not the one they submitted.
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

  -- 5 · THE WORLD HALF, ASKED CHEAPLY: before any lock, so an obviously impossible claim never
  -- queues behind another client's admission. It is NOT the answer that counts — step 6 asks again.
  perform clara._assert_claim_basis(p_client, p_claim, true);

  -- 6 · THE CLAIMANT. The client rung, then 0041's role leaf — 0043's own order, taken BEFORE the
  -- core touches clara.accounting_work and clara.agent_tasks.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  perform clara._fa_lock_roles(p_client);

  -- 6a · THE WORLD HALF AGAIN, THIS TIME UNDER THE RUNG THAT MAKES THE ANSWER DURABLE. Everything
  -- step 5 asked can move between step 5 and here, because another admission on this client can
  -- COMMIT in that window — and the (iv) correction-target arm is precisely the one whose truth
  -- another admission changes. Without this re-ask, two concurrent corrections of one claim both
  -- passed (iv), and the loser met `uq_staff_expense_claims_corrects` as a RAW 23505: an error
  -- `workErrorResponse` does not classify (it claims 40P01/40001 and the CLR codes), so the route
  -- answered 500 `{error:"internal"}` and the browser said "unavailable" where the successor
  -- contract promises `correction_target_already_corrected`. The posting core's own evidence
  -- handler states the house rule this restores: a conflict leaves as a TYPED refusal, never as a
  -- raw 23505 the runtime cannot classify. Every other world fact — the enrolment's liveness, the
  -- settlement account's class, the advance cap, the sealed year — is re-asked on the same footing.
  --
  -- IT IS A READ, NOT A SECOND LOCK: `_assert_claim_basis` is STABLE and takes its own snapshot at
  -- this statement, which under READ COMMITTED is taken AFTER the rung was granted — so it sees
  -- whatever the previous holder committed.
  perform clara._assert_claim_basis(p_client, p_claim, true);

  v_enrol := clara._claim_resolve_claimant(p_client, p_author, p_claim, p_intent_key);
  select sa.person_label into v_label from clara.staff_advance_accounts sa where sa.id = v_enrol;

  -- 7 · THE UNCHANGED CORE. `purpose => 'journal_entry'`, `p_adjustment => null`: a claim rides the
  -- purpose that can actually post (see this file's header).
  v_basis := clara._claim_journal_basis(p_claim);
  v_res := clara._admit_accounting_work_core(p_client, p_author, p_intent_key, 'journal_entry',
    v_basis, null, p_basis_origin, p_source_refs, p_model);
  v_work := (v_res->>'work_id')::uuid;

  -- 8 · THE CLAIM ROW, inside the SAME transaction.
  v_settlement := btrim(coalesce(p_claim->>'settlement',''));
  v_credit := clara._claim_settlement_account(p_claim);
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
      case when v_settlement = 'advance_application'
           then clara._claim_uuid(p_claim, 'advance_id', 'claim.advance_id') end,
      v_canon, v_corrects, p_author, p_author)
    on conflict (work_id) do nothing;
  select sec.id into v_claim from clara.staff_expense_claims sec where sec.work_id = v_work;

  insert into clara.staff_expense_claim_status(firm_id, client_id, claim_id, state, detail)
    values (v_firm, p_client, v_claim, 'admitted',
      jsonb_build_object('admitted_by', p_author, 'settlement', v_settlement))
    on conflict (claim_id, state) do nothing;

  -- THE WAITING ITEMS, NAMED. AC3's per-item continuation: the independent items post now, and the
  -- ones whose own fact is still missing are recorded with the NAME of what they are waiting for.
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

  -- THE BACK-POINTER, stamped by the CORRECTING row in the same transaction — the one update
  -- `t_staff_expense_claims_append_only` admits. `uq_staff_expense_claims_corrects` is the
  -- structural half: two Works correcting one claim cannot both land.
  if v_corrects is not null then
    update clara.staff_expense_claims set corrected_by_claim_id = v_claim
     where id = v_corrects and client_id = p_client;
  end if;

  perform clara._audit(v_firm, p_author, null, null, 'admit_staff_expense_claim_work', null,
    jsonb_build_object('client', p_client, 'work', v_work, 'claim', v_claim,
      'logical_op_id', v_res->>'logical_op_id', 'intent_key', p_intent_key,
      'settlement', v_settlement, 'claimant_enrolment_id', v_enrol,
      'amount_cents', trunc((p_claim->>'amount_cents')::numeric)::bigint));

  return v_res || jsonb_build_object('claim_id', v_claim);
end $$;
revoke all on function clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text) from public;
grant execute on function clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text) to clara_runtime;
comment on function clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text) is
  '#638: admit ONE staff expense claim as durable accounting work. clara_runtime ONLY, the lane '
  'clara.admit_journal_work and clara.admit_periodic_adjustment_work sit in, acting OBO the named '
  'p_author. The Work''s purpose is journal_entry -- the posting core is UNCHANGED -- and the '
  'typed claim lives in clara.staff_expense_claims, written in this same transaction. Idempotent '
  'on (firm, client, intent_key); the payload comparison covers the canonical claim.';

-- =====================================================================================
-- §D  POSTED STATE, AND REVERSED STATE.
--
-- THE CLAIM'S OWN ROW IS NEVER UPDATED — it is append-only and its whole point is to record what
-- was CLAIMED. The moment the claim became a fact is recorded on the status ledger instead, by a
-- trigger on the relation that decides it: `clara.operation_receipts`, whose committed row IS the
-- authoritative statement that the operation happened (0178:411-433).
--
-- AN `after insert` TRIGGER, NOT A DEFERRED ONE. The receipt is inserted by
-- `clara._record_journal_entry_core` after the entry is approved, inside the posting transaction —
-- so an immediate AFTER INSERT sees exactly the row it needs and the ledger stamp is part of the
-- same commit. `on conflict (claim_id, state) do nothing` makes it idempotent against a replay
-- that somehow reached a second insert.
--
-- FALLBACK, STATED SO A LATER HAND DOES NOT HAVE TO GUESS: were this trigger ever removed, the
-- posted state remains derivable at read time by the same join the reads already make
-- (`work_id` → committed receipt → `effects->>'entry_id'`), and §G's reads do exactly that for the
-- entry and receipt columns. The ledger is the INDEXED handle and the audit trail, not the only
-- source of truth.
-- =====================================================================================
create function clara._tf_staff_expense_claim_posted() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_claim uuid; v_firm uuid; v_client uuid;
begin
  if new.outcome <> 'committed' then return null; end if;
  select sec.id, sec.firm_id, sec.client_id into v_claim, v_firm, v_client
    from clara.staff_expense_claims sec where sec.work_id = new.work_id;
  if v_claim is null then return null; end if;
  insert into clara.staff_expense_claim_status(firm_id, client_id, claim_id, state, entry_id,
      receipt_id, detail)
    values (v_firm, v_client, v_claim, 'posted',
      nullif(btrim(coalesce(new.effects->>'entry_id','')),'')::uuid, new.id,
      jsonb_build_object('logical_op_id', new.logical_op_id, 'on_behalf_of', new.on_behalf_of))
    on conflict (claim_id, state) do nothing;
  return null;
end $$;
revoke all on function clara._tf_staff_expense_claim_posted() from public;
create trigger t_operation_receipts_staff_expense_claim_posted
  after insert on clara.operation_receipts
  for each row when (new.outcome = 'committed')
  execute function clara._tf_staff_expense_claim_posted();

-- THE REVERSAL, on the same footing. `clara.reverse_entry` stamps `reversed_by` on the original
-- entry; the claim that stood on it needs to say so, because AC4's unwind is about the claim, not
-- only about the GL lines. Guarded on the NULL → id transition so this fires once per reversal and
-- costs one indexed lookup on every other approved-entry update.
create function clara._tf_staff_expense_claim_reversed() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_claim uuid; v_firm uuid; v_client uuid;
begin
  select st.claim_id, st.firm_id, st.client_id into v_claim, v_firm, v_client
    from clara.staff_expense_claim_status st
   where st.entry_id = new.id and st.state = 'posted';
  if v_claim is null then return null; end if;
  insert into clara.staff_expense_claim_status(firm_id, client_id, claim_id, state, entry_id,
      detail)
    values (v_firm, v_client, v_claim, 'reversed', new.id,
      jsonb_build_object('reversed_by', new.reversed_by, 'reason', new.reversal_reason))
    on conflict (claim_id, state) do nothing;
  return null;
end $$;
revoke all on function clara._tf_staff_expense_claim_reversed() from public;
create trigger t_je_staff_expense_claim_reversed
  after update on clara.journal_entries
  for each row when (new.reversed_by is not null and old.reversed_by is null)
  execute function clara._tf_staff_expense_claim_reversed();

-- =====================================================================================
-- §E  THE LANE-AGNOSTIC ADVANCE BIRTH TRIGGER (DECISIONS §1.4).
--
-- WHAT IT SOLVES. The Work lane never calls `clara._subledger_on_approve`, so `clara._adv_on_approve`
-- arm (2) — the arm that mints an allocation from the entry's `flags` proposal — never runs here;
-- and the belt, a constraint trigger on EVERY approved row, refuses a bare credit on an enrolled
-- advance account with CLR40 `advance_application_missing`. Stamping `flags` would not help: the
-- posting core writes `flags` only for #643's two purposes and the immutability trigger refuses a
-- later edit, and nothing on this lane would read the stamp anyway.
--
-- SO THE REGISTRATION IS BORN HERE, FROM THE CLAIM ITSELF, and it is LANE-AGNOSTIC: the trigger
-- names no verb and no purpose. Any approved entry whose committed receipt belongs to a Work a
-- staff expense claim names, with `settlement = 'advance_application'`, gets its allocation.
--
-- IT IS NOT A FIFTH CALLER OF THE HOOK. It inserts into `clara.staff_advance_applications`
-- directly — the same relation, the same `kind='claim'` vocabulary (0043:543-544), the same
-- entry-posting-date effective date (0043 SS3.2's hook-derived rule) — and never names
-- `clara._subledger_on_approve`. §H re-derives the 0037:3840-3845 census at its UNCHANGED
-- cardinality — the MEASURED SIX of this file's header (§0 and §H T.2 both assert that roster
-- byte for byte), NOT the four 0037's own text names.
--
-- THE CAP IS ASKED, NOT RE-DERIVED. `clara._adv_over_application` (0043:1220) is the ONE body that
-- knows whether an allocation would take the SS3.2 outstanding negative at its own date or at any
-- later boundary. A second copy of that arithmetic here is exactly the class of defect 0043's own
-- round-8 note records. The advance row is LOCKED first, in the 0037 total order, so two concurrent
-- claims against one advance serialise here rather than both passing the cap and both committing.
--
-- THE NAME IS THE MECHANISM. `t_je_adv_claim_application_birth` sorts BEFORE
-- `t_je_adv_movement_belt` under any collation ('c' < 'm' at the first differing byte), and
-- deferred constraint-trigger events on one row fire at commit in the order they were queued, which
-- for one row and one operation is trigger-name order. Cell `p638.advance.order` asserts it.
-- =====================================================================================
create function clara._tf_adv_claim_application_birth() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_claim uuid; v_firm uuid; v_client uuid; v_advance uuid; v_code text; v_obo uuid;
  v_line uuid; v_credit bigint; v_enrol uuid; v_cap jsonb;
begin
  -- ONE indexed lookup (ix_operation_receipts_entry) and one more (uq_staff_expense_claims_work):
  -- an approved entry that is not a claim's leaves here immediately.
  select sec.id, sec.firm_id, sec.client_id, sec.advance_id, sec.advance_account_code,
         sec.on_behalf_of
    into v_claim, v_firm, v_client, v_advance, v_code, v_obo
    from clara.operation_receipts r
    join clara.staff_expense_claims sec on sec.work_id = r.work_id
   where r.outcome = 'committed' and (r.effects ->> 'entry_id') = new.id::text
     and sec.settlement = 'advance_application'
   limit 1;
  if v_claim is null then return null; end if;

  -- THE CREDIT LEG THIS CLAIM DISCHARGES, by the account the claim named. The belt reads coverage
  -- per LINE, so the allocation must be keyed to this very line id.
  select jl.id, jl.credit_cents into v_line, v_credit
    from clara.journal_lines jl
   where jl.entry_id = new.id and jl.account_code = v_code and jl.credit_cents > 0
   order by jl.line_no limit 1;
  if v_line is null then return null; end if;   -- nothing to register; the belt speaks for itself

  -- IDEMPOTENT, and asked before the cap so a replay never re-tests an allocation it already made.
  if exists (select 1 from clara.staff_advance_applications ap
              where ap.application_line_id = v_line and ap.advance_id = v_advance) then
    return null;
  end if;

  -- THE ROW LOCK, THEN THE SHARED CAP.
  perform 1 from clara.staff_advances sa where sa.id = v_advance for update;
  select sa.enrolment_id into v_enrol from clara.staff_advances sa
   where sa.id = v_advance and sa.client_id = v_client;
  if v_enrol is null then
    raise exception 'this claim discharges an advance this client does not hold'
      using errcode='CLR40',
      detail=jsonb_build_object('reason','advance_allocation_mismatch','entry_id',new.id,
        'advance_id',v_advance,'claim_id',v_claim)::text;
  end if;
  v_cap := clara._adv_over_application(v_advance, v_credit, new.posting_date);
  if v_cap is not null then
    raise exception 'this claim would over-apply advance %: % cents outstanding at %, % claimed',
      v_advance, v_cap->>'outstanding_cents', v_cap->>'boundary_date', v_credit
      using errcode='CLR39',
      detail=(v_cap || jsonb_build_object('reason','advance_over_application','entry_id',new.id,
        'claim_id',v_claim))::text;
  end if;

  insert into clara.staff_advance_applications(firm_id, client_id, advance_id, enrolment_id,
      application_line_id, entry_id, kind, amount_cents, effective_date, reverses_application_id,
      created_by, reason)
    values (v_firm, v_client, v_advance, v_enrol, v_line, new.id, 'claim',
      v_credit, new.posting_date, null, v_obo,
      'staff expense claim ' || v_claim::text)
    on conflict (application_line_id, advance_id) do nothing;
  return null;
end $$;
revoke all on function clara._tf_adv_claim_application_birth() from public;
create constraint trigger t_je_adv_claim_application_birth
  after insert or update on clara.journal_entries
  deferrable initially deferred for each row when (new.status = 'approved')
  execute function clara._tf_adv_claim_application_birth();

-- =====================================================================================
-- §G  THE READS. Viewer-floored, firm+client scoped, each returning ONE jsonb value.
--
-- VIEWER RATHER THAN BOOKKEEPER, for `clara.list_periodic_adjustments`' own reason: this is a read
-- of the client's own books in the same class as `clara.list_journal_entries`; the WRITE door is
-- floored at bookkeeper and rechecks that floor for itself. Hiding a history table from a viewer
-- would grant and revoke nothing.
--
-- THE POSTED ENTRY AND RECEIPT ARE JOINED, NEVER STORED. `work_id` → the committed
-- `clara.operation_receipts` row → `effects->>'entry_id'` → the entry's live status and reversal.
-- The claim row stays append-only and nothing has to be updated at posting time.
-- =====================================================================================
create function clara.list_staff_expense_claims(p_client uuid, p_from date default null,
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
                 as pending_item_count
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
comment on function clara.list_staff_expense_claims(uuid,date,date) is
  '#638: the client''s staff expense claims, newest posting date first, with claimant, itemisation, '
  'exact amount, settlement, posted entry and its live/reversed state, operation receipt and '
  'correction chain. Viewer+, firm+client floored, capped at 500 rows.';

/* ONE claim, with its status ledger and — where the claim discharged an advance — the allocation
   the register actually minted. The advance LINEAGE is what AC6 asks for, and it is read from the
   register's own rows rather than from the claim's statement of intent. */
create function clara.get_staff_expense_claim(p_claim uuid) returns jsonb
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
comment on function clara.get_staff_expense_claim(uuid) is
  '#638: ONE staff expense claim with its status ledger, its posted entry and receipt (joined, '
  'never stored) and the advance allocations the register actually minted. Viewer+, firm-scoped; '
  'NULL rather than a refusal for a claim outside the caller''s firm.';

/**
 * "Staff expense claim — <claimant>" on the Work list and the Work detail, WITHOUT a purpose value.
 *
 * The `clara.get_work_plan_origin` precedent (0193:2129): viewer-floored, firm-scoped, ONE jsonb
 * object or NULL. This is how a surface labels a claim Work when the Work's purpose is — correctly,
 * deliberately — the plain `journal_entry` every other manual posting carries. NULL for a Work that
 * is not a claim is the honest answer, never a fabricated origin.
 */
create function clara.get_work_claim_origin(p_work uuid) returns jsonb
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
      'corrected_by_claim_id', sec.corrected_by_claim_id)
    into v_out
    from clara.staff_expense_claims sec
   where sec.work_id = p_work and sec.firm_id = v_firm;
  return v_out;
end $$;
revoke all on function clara.get_work_claim_origin(uuid) from public;
grant execute on function clara.get_work_claim_origin(uuid) to clara_authenticated;
comment on function clara.get_work_claim_origin(uuid) is
  '#638: the claim a `journal_entry` Work carries, or NULL. Lets the Work list and Work detail '
  'label a staff expense claim WITHOUT a purpose value -- the purpose vocabulary is deliberately '
  'unwidened (see 0221''s header). Viewer+, firm-scoped.';

reset role;

-- =====================================================================================
-- §H  TAIL CENSUS. Every claim this file made, re-READ from the committed catalog — and, first,
-- every claim it made about what it did NOT touch.
-- =====================================================================================
do $w638_tail$
declare v_n int; v_src text; v_def text; v_names text; v_a int; v_b int;
begin
  -- (T.1) THE MACHINE-CHECKABLE PROOF THAT #638 STAYED OFF THE CORE: both purpose CHECK texts are
  -- BYTE-IDENTICAL to their 0194 form, and the six bodies this file edits none of are at the exact
  -- shas §0 measured. If a later hand "tidies" a claim into a fourth purpose, this is what fails.
  foreach v_def in array array['accounting_work_purpose_check','operation_receipts_purpose_check'] loop
    if pg_get_constraintdef((select oid from pg_constraint
          where conrelid = (case when v_def like 'accounting_work%' then 'clara.accounting_work'::regclass
                                 else 'clara.operation_receipts'::regclass end)
            and conname = v_def))
       <> 'CHECK ((purpose = ANY (ARRAY[''journal_entry''::text, ''periodic_stock_adjustment''::text, ''payroll_obligation''::text])))' then
      raise exception '#638 tail: % MOVED -- a staff expense claim rides journal_entry and widens nothing', v_def;
    end if;
  end loop;
  -- The same six, re-read AFTER this file ran. Three carry riders-batch bodies (#787's 0204,
  -- #797's 0212) since the wave's re-base; the pins are the prestate's own, re-issued together.
  for v_def, v_src in
    select * from (values
      ('clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)',
       '10b89677d342a424d5959ded8ad2c8c974c4ff9bdc26f5c0dd6c773a15af2612'),
      ('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)',
       'bc24524656e1a47812d12c4db24afde565e2aad3bb60f25d18234c05860838b3'),
      ('clara._assert_adjustment_basis(text,jsonb)',
       '69377e43cb924ad73ce87f6fd0fa26aa5c18597064b59bc88e8247fb31e2c263'),
      ('clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean)',
       'ca1510cf9d82a1ed8c87d8de94e8dbdff2f586744337bc5d477f4e7e4e687c02'),
      ('clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)',
       'ea9957fcb4fef5b578859977b1a81edf8d6bfebdaef49bd2223721d907b1a285'),
      ('clara._adv_on_approve(uuid)',
       'ddf4159f2e38b3f76005bfa5b70787b7b6aa591a410de95eb0e2717100813ac2')
    ) as t(sig, sha)
  loop
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = v_def::regprocedure) is distinct from v_src then
      raise exception '#638 tail: % is NOT byte-identical to the body this file measured -- 0221 recuts nothing shared', v_def;
    end if;
  end loop;

  -- (T.2) THE SUBLEDGER-HOOK CALLER CENSUS, at 0037:3840-3845's own instrument, at its UNCHANGED
  -- measured cardinality of SIX (see the header's MEASURED CORRECTION). Section E registers the
  -- allocation itself, inserting into clara.staff_advance_applications directly, and never names
  -- the hook at all.
  select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C"), '')
    into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc ~ 'clara\._subledger_on_approve *\('
     and p.oid <> 'clara._subledger_on_approve(uuid)'::regprocedure;
  if v_names <> 'clara._approve_entry_core(jsonb,uuid,uuid,text,text), '
              || 'clara._approve_opening_entry(uuid,uuid,uuid,text,integer), '
              || 'clara.approve_wrong_client_correction(uuid,text,text,text), '
              || 'clara.finalize_close(uuid,text,text), '
              || 'clara.reopen_fiscal_year(uuid,text,jsonb,text,text), '
              || 'clara.reverse_entry(uuid,text,text)' then
    raise exception '#638 tail: the subledger hook''s callers are {%} -- 0221 adds none, so this roster must be BYTE-IDENTICAL to the one section 0 measured', v_names;
  end if;

  -- (T.3) 0042 TAIL 20(a)/(b), RE-RUN AS THIS FILE'S OWN ASSERTION. WDB-G7 is unrecoverable
  -- (migrations are append-only), so it is asserted here rather than trusted to review.
  select coalesce(string_agg(pg_get_constraintdef(c.oid), ' ~ ' order by c.conname::text collate "C"), '')
    into v_def from pg_constraint c
   where c.conrelid = 'clara.open_items'::regclass and c.contype = 'c';
  if position('''ar''' in v_def) = 0 or position('''ap''' in v_def) = 0 then
    raise exception '#638 tail 20(a): clara.open_items lost its ar/ap domain pair (defs are %)', v_def;
  end if;
  if position('advance' in v_def) <> 0 or position('claim' in v_def) <> 0 then
    raise exception '#638 tail 20(a): a clara.open_items CHECK admits an advance/claim concept (defs are %) -- an employee payable is a non-control liability leg plus its own register, never an open item', v_def;
  end if;
  select coalesce(string_agg(column_name::text, ', ' order by column_name::text collate "C"), '')
    into v_names from information_schema.columns
   where table_schema = 'clara' and table_name = 'open_items'
     and (column_name like '%advance%' or column_name like '%claim%' or column_name like '%employee%');
  if v_names <> '' then
    raise exception '#638 tail 20(a): clara.open_items gained the column(s) {%}', v_names;
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'clara.counterparties'::regclass and c.conname = 'counterparties_kind_check';
  if v_def is null then
    raise exception '#638 tail 20(b): counterparties_kind_check is GONE';
  end if;
  if position('employee' in v_def) <> 0 or position('staff' in v_def) <> 0 then
    raise exception '#638 tail 20(b): counterparties_kind_check admits an employee/staff kind (def is %)', v_def;
  end if;

  -- (T.4) THE NEW TRIGGER'S FIRING POSITION. Deferred constraint-trigger events on one row fire in
  -- trigger-NAME order, so this comparison IS the mechanism (see §E's header). Both must be
  -- DEFERRABLE INITIALLY DEFERRED, or the birth would run before the receipt exists.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.journal_entries'::regclass and not tgisinternal
     and tgname in ('t_je_adv_claim_application_birth','t_je_adv_movement_belt')
     and tgdeferrable and tginitdeferred;
  if v_n <> 2 then
    raise exception '#638 tail: the birth/belt pair is not two DEFERRABLE INITIALLY DEFERRED triggers (% of 2)', v_n;
  end if;
  if not ('t_je_adv_claim_application_birth' < 't_je_adv_movement_belt' collate "C") then
    raise exception '#638 tail: the birth trigger no longer sorts before the belt -- the name IS the firing order';
  end if;

  -- (T.5) THE TWO NEW RELATIONS: forced RLS, ZERO DML to every application role, the belts, and the
  -- structural uniques. Read from the ACL and the catalog, grantee by grantee.
  foreach v_def in array array['staff_expense_claims','staff_expense_claim_status'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'clara' and c.relname = v_def
                      and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception '#638 tail: clara.% is not RLS-forced', v_def;
    end if;
    select count(*)::int into v_n from (
      select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                          'clara_wake_interactive','clara_wake_proactive']) as r) g
     where has_table_privilege(g.r, 'clara.' || v_def, 'INSERT')
        or has_table_privilege(g.r, 'clara.' || v_def, 'UPDATE')
        or has_table_privilege(g.r, 'clara.' || v_def, 'DELETE');
    if v_n <> 0 then
      raise exception '#638 tail: % application role(s) hold DML on clara.%', v_n, v_def;
    end if;
    if not has_table_privilege('clara_authenticated', 'clara.' || v_def, 'SELECT') then
      raise exception '#638 tail: clara_authenticated cannot read clara.%', v_def;
    end if;
    if has_table_privilege('clara_runtime', 'clara.' || v_def, 'SELECT') then
      raise exception '#638 tail: clara_runtime holds a read on clara.% -- the run is told its effect by the wake verb', v_def;
    end if;
    select count(*)::int into v_n from pg_trigger
     where tgrelid = ('clara.' || v_def)::regclass and not tgisinternal
       and (tgname like '%\_append\_only' or tgname like '%\_no\_truncate');
    if v_n < 2 then
      raise exception '#638 tail: clara.% is missing its append-only/no-truncate belt pair (% found)', v_def, v_n;
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conrelid='clara.staff_expense_claims'::regclass
                   and conname='uq_staff_expense_claims_work') then
    raise exception '#638 tail: the one-claim-per-Work unique is absent -- the door''s convergence depends on it';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='clara.staff_expense_claims'::regclass
                   and conname='uq_staff_expense_claims_logical') then
    raise exception '#638 tail: the one-claim-per-logical-identity unique is absent';
  end if;
  select count(*)::int into v_n from pg_indexes
   where schemaname='clara' and indexname='uq_staff_expense_claims_corrects';
  if v_n <> 1 then
    raise exception '#638 tail: uq_staff_expense_claims_corrects is absent -- two Works could correct one claim';
  end if;
  -- EVERY CITATION CARRIES THE TENANT. Read as the catalog's own constraint definitions, so a
  -- future single-column FK -- the shape that would let a claim cite another firm's Work, enrolment
  -- or advance -- cannot be added without this failing.
  for v_def, v_names in
    select * from (values
      ('fk_staff_expense_claims_work',
       'FOREIGN KEY (work_id, firm_id, client_id) REFERENCES clara.accounting_work(id, firm_id, client_id)'),
      ('fk_staff_expense_claims_enrolment',
       'FOREIGN KEY (claimant_enrolment_id, firm_id, client_id) REFERENCES clara.staff_advance_accounts(id, firm_id, client_id)'),
      ('fk_staff_expense_claims_advance',
       'FOREIGN KEY (advance_id, firm_id, client_id) REFERENCES clara.staff_advances(id, firm_id, client_id)'),
      ('fk_staff_expense_claims_document',
       'FOREIGN KEY (source_document_id, firm_id) REFERENCES clara.documents(id, firm_id)')
    ) as t(name, def)
  loop
    if (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid='clara.staff_expense_claims'::regclass and conname=v_def) is distinct from v_names then
      raise exception '#638 tail: % is not the tenant-carrying composite reference this file declared (got %)',
        v_def, (select pg_get_constraintdef(oid) from pg_constraint
                 where conrelid='clara.staff_expense_claims'::regclass and conname=v_def);
    end if;
  end loop;

  -- (T.6) THE GRANT MATRIX: the door to clara_runtime ONLY, the three reads to clara_authenticated
  -- ONLY, and every new internal ungranted.
  if not has_function_privilege('clara_runtime',
       'clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)', 'EXECUTE') then
    raise exception '#638 tail: clara_runtime cannot execute the admission door';
  end if;
  if has_function_privilege('clara_authenticated',
       'clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)', 'EXECUTE') then
    raise exception '#638 tail: clara_authenticated holds the admission door -- the human form goes through the runtime route';
  end if;
  foreach v_def in array array['clara.list_staff_expense_claims(uuid,date,date)',
                               'clara.get_staff_expense_claim(uuid)',
                               'clara.get_work_claim_origin(uuid)'] loop
    if not has_function_privilege('clara_authenticated', v_def, 'EXECUTE') then
      raise exception '#638 tail: clara_authenticated cannot execute %', v_def;
    end if;
    if has_function_privilege('clara_runtime', v_def, 'EXECUTE')
       or has_function_privilege('clara_agent_ro', v_def, 'EXECUTE') then
      raise exception '#638 tail: % is granted beyond clara_authenticated', v_def;
    end if;
  end loop;
  foreach v_def in array array['clara._assert_claim_basis(uuid,jsonb,boolean)',
                               'clara._claim_basis_canonical(jsonb)',
                               'clara._claim_journal_basis(jsonb)',
                               'clara._claim_resolve_claimant(uuid,uuid,jsonb,text)',
                               'clara._claim_item_total(jsonb)',
                               'clara._claim_settlement_account(jsonb)',
                               'clara._claim_text(jsonb,text,int,text,boolean)',
                               'clara._claim_cents(jsonb,text,text,boolean)',
                               'clara._claim_date(jsonb,text,text,text,boolean)',
                               'clara._claim_uuid(jsonb,text,text)',
                               'clara._tf_staff_expense_claim_posted()',
                               'clara._tf_staff_expense_claim_reversed()',
                               'clara._tf_staff_expense_claim_append_only()',
                               'clara._tf_adv_claim_application_birth()'] loop
    if has_function_privilege('clara_authenticated', v_def, 'EXECUTE')
       or has_function_privilege('clara_runtime', v_def, 'EXECUTE')
       or has_function_privilege('clara_agent_ro', v_def, 'EXECUTE') then
      raise exception '#638 tail: the internal % is granted to an application role', v_def;
    end if;
  end loop;

  -- (T.7) THE TWO REGISTRIES THIS FILE PROMISED NOT TO TOUCH (#633/#624's ground).
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'clara.documents'::regclass and c.conname = 'documents_document_kind_check';
  if v_def is null or position('claim_form' in v_def) = 0 then
    raise exception '#638 tail: documents_document_kind_check moved or lost claim_form (def is %)', v_def;
  end if;
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#638 tail: clara.document_capabilities carries % registry versions -- 0221 bumps none', v_n;
  end if;

  raise notice '#638 tail OK (1/7): both purpose CHECK texts are byte-identical to 0194 and the six non-regression bodies are unchanged -- 0221 recuts nothing shared';
  raise notice '#638 tail OK (2/7): the subledger-hook caller census is byte-identical to the six measured before this migration ran -- 0221 adds no caller';
  raise notice '#638 tail OK (3/7): 0042 tail 20(a)/(b) stand -- no advance/claim concept in open_items, no employee/staff counterparty kind';
  raise notice '#638 tail OK (4/7): t_je_adv_claim_application_birth sorts before t_je_adv_movement_belt and both are DEFERRABLE INITIALLY DEFERRED';
  raise notice '#638 tail OK (5/7): both new relations are RLS-forced, readable by clara_authenticated only, with zero application-role DML and every citation tenant-carrying';
  raise notice '#638 tail OK (6/7): the door is clara_runtime-only, the three reads clara_authenticated-only, and all fourteen internals ungranted';
  raise notice '#638 tail OK (7/7): documents_document_kind_check and document_capabilities.registry_version are unmoved';
end
$w638_tail$;
