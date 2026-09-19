-- 0225_trade_invoices — #655 (refresh spec; journeys B6 contract-only, C1, C3, C6-birth):
-- TRADE INVOICES, SUPPLIER BILLS AND THE OPEN ITEM THEY BIRTH.
-- =====================================================================================
-- Spec of record: issue #655 — "完整记录发票、账单及对应应收应付". Domain words: CONTEXT.md —
-- "Trade invoice", "Due-date basis", "Open item", "Control account", "Accounting work",
-- "Operation receipt". Builds on 0037 (the subledger), 0040 (the due-date producer), 0178 (the
-- accounting-work lane), 0182 (evidence + the source-ref predicates), 0194 (the admission core),
-- 0204 (the live posting core), 0215 (counterparty identity provenance), 0216 (the lane-agnostic
-- deferred birth instrument) and 0221 (the typed-business-object precedent this file copies).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A NEW relation `clara.trade_invoices` with an append-only
-- status ledger child, ONE new admission door granted to `clara_runtime` alone, a lane-agnostic
-- deferred BIRTH TRIGGER that materialises the signed AR/AP open item, one new read — and THREE
-- recut bodies, each opening exactly one narrow, measured door for a Work that carries a
-- `clara.trade_invoices` row and byte-identical for every other input in the estate.
--
-- =====================================================================================
-- MEASUREMENT 1 — WHY THE POSTING CORE HAS TO BE RECUT AT ALL (D11).
--
-- `clara._record_journal_entry_core` section 7 refuses ANY payable/receivable-class leg with CLR10
-- `generic_control_leg` (0204:550-570). Its stated ground is that "an open item is a claim about
-- who owes what, a documentless generic basis is the weakest anchor in the estate, and a weak
-- anchor may not corroborate a subledger consequence". A trade invoice is NOT a generic basis: it
-- is a typed object with a resolved party, a document date, a stated total and an admitted kind,
-- written durably at admission. So the sixth copy of that body opens the arm for EXACTLY that
-- case and for no other — the other sixteen refusals are carried byte for byte and all seventeen
-- tokens are re-asserted by name in section F.
--
-- =====================================================================================
-- MEASUREMENT 2 — AND WHY TWO MORE BODIES HAD TO MOVE WITH IT. THE FINDING THAT SHAPED THIS FILE.
--
-- MEASURED on clara_655 (PG 17.11) BEFORE a line of this migration was written, by approving a
-- documentless `coding_kind IS NULL` entry carrying a payable control leg and running the belts'
-- own predicates against it:
--
--   * `clara._subledger_classify_entry(entry)` returns `item_kind='adjustment'` for it — LADDER 5,
--     `coding_kind is null => 'adjustment'` (0037:995-996). Measured output:
--       {"domain":"ap","item_kind":"adjustment","amount_cents":"106000"}
--   * `clara._tf_subledger_entry_belt` ARM 1 compares the classifier's rows against the entry's
--     `clara.open_items` rows and raises CLR10 `subledger_entry_untied` when `item_kind` differs.
--     Measured with an item side of `item_kind='bill'`: v_bad = 1 (it raises). With today's
--     `adjustment` item side: v_bad = 0.
--   * `clara._tf_subledger_item_belt`'s "KIND TO SOURCE" arm is harder still — it hard-codes
--     `item_kind='bill'` <=> `coding_kind='supplier_bill'` and raises CLR10
--     `subledger_item_kind_mismatch` otherwise, without consulting the classifier at all.
--
-- SO A `bill`/`invoice` OPEN ITEM ON A `coding_kind IS NULL` ENTRY IS REFUSED TWICE AT COMMIT.
-- The estate's law is that `clara._subledger_classify_entry` is THE ONE classifier and the
-- subledger must be derivable from the ledger; a second lane that mints `bill` items without
-- teaching the classifier about itself is not a new lane, it is a broken invariant. The two
-- bodies therefore learn the new lane, each through ONE additive arm that fires only when
-- `clara.trade_invoices` names the entry:
--
--   * the classifier gains LADDER 3T, ABOVE LADDER 5's `coding_kind is null => 'adjustment'`
--     default and BELOW ladders 1 (reversal) and 2 (opening), so a reversal mirror and an opening
--     entry are untouched by construction;
--   * the item belt's `bill`/`invoice` arms accept the trade-invoice lane as a second lawful
--     source of the same kind.
--
-- EVERY OTHER INPUT IN THE ESTATE CLASSIFIES AND VALIDATES BYTE-IDENTICALLY, and section F proves
-- it by re-running both bodies' pre-existing ladders. THE ALTERNATIVE WAS REJECTED ON MEASUREMENT,
-- not taste: stamping `journal_entries.coding_kind = 'supplier_bill'` would make all three bodies
-- agree with no recut at all, but it arms `clara._assert_supplier_bill_shape_at_projected`, whose
-- `sst_purchase_cost` arm REQUIRES a document-stated tax total (CLR21 `tax_tie_failed`) — so the
-- first documentless chat- or UI-stated bill carrying an SST input leg on a client whose chart
-- marks that account would be unpostable. That is a production landmine hidden inside a
-- convenience; two narrow, named arms are the honest cost. (WORK-ORDER rule 6: this widens the
-- brief's ONE recut to THREE. It is stated in this header, in section C, and in the final report.)
--
-- =====================================================================================
-- MEASUREMENT 3 — THE BIRTH TRIGGER'S FIRING ORDER AND ITS SUBJECT JOIN.
--
-- Enumerated from `pg_trigger` on `clara.journal_entries` on clara_655 (PG 17.11): TWENTY-THREE
-- triggers, of which exactly ONE deferred constraint trigger reads `clara.open_items` at commit —
-- `t_je_subledger_belt` (`clara._tf_subledger_entry_belt`). `t_snapshot_staleness` also reads
-- `clara.open_items` but is a NON-deferred AFTER trigger and has fired long before the deferred
-- queue runs. Deferred constraint-trigger events for one row are QUEUED in trigger-name order at
-- the moment of the row operation and fire at commit in queue order, so the birth trigger is named
-- `t_je_open_item_birth` — 'o' < 's' at the first differing byte after the shared `t_je_` prefix,
-- under any collation — and the item exists by the time the belt counts it. Cell
-- `p655.rig.trigger_order` asserts the pair out of `pg_trigger` for the day somebody renames one.
-- (0216:347-349 measured the same physics for `t_je_fa_acquisition_birth`; this is the
-- reproduction that ruling demanded, with THIS file's trigger name in place.)
--
-- THE SUBJECT JOIN, ALSO MEASURED. Three paths could resolve an approved entry back to its trade
-- invoice at deferred-queue time. The one this file uses is (1); (2) is kept as the stated
-- fallback and (3) is named but not used:
--   (1) `clara.trade_invoice_status` on (state='posted', entry_id) through
--       `ix_trade_invoice_status_entry`. The `posted` row is appended by section A's NON-DEFERRED
--       AFTER INSERT trigger on `clara.operation_receipts`, which fired inside the posting
--       statement (0204:671-678) and is therefore visible.
--   (2) the receipt join `o.effects->>'entry_id' = new.id::text` — a TEXT comparison so
--       `ix_operation_receipts_entry` (0178:454-455) is usable, never a uuid cast of the jsonb
--       expression. THAT THIS IS SATISFIABLE AT DEFERRED-QUEUE TIME IS NOT AN ARGUMENT: the live
--       `clara._tf_assert_agent_post_receipt` — itself a DEFERRED constraint trigger on
--       `clara.journal_entries` — already counts committed operation receipts through exactly this
--       predicate and would refuse every Work-lane post if it could not see them.
--   (3) `clara.accounting_work.result->>'entry_id'` (0204:735) — named for completeness only.
--
-- =====================================================================================
-- MEASUREMENT 4 — WHAT THIS FILE DOES NOT TOUCH, AND WHY.
--
--   * `clara._admit_accounting_work_core` (0194:1062) takes no `p_work` and mints the id itself,
--     answering a repeated key with `replayed:true` and the SAME id — so the typed row can only be
--     written AFTER it returns. UNCHANGED, pinned.
--   * `clara._subledger_on_approve` (0037:1050) — this file does NOT become its seventh caller.
--     The census stays at the MEASURED SIX (0216:938-947), re-derived in section 0 and section F.
--   * `clara._validate_entry_lines` (0009:257) drops every key but
--     account_code/debit_cents/credit_cents/description — which is exactly why the party is
--     stamped AFTER the line insert, in the `clara._approve_entry_core` idiom (0037:1885-1888).
--     UNCHANGED, pinned.
--   * `clara._approve_entry_core`, `clara._assert_journal_basis`, the whole opening ladder,
--     `clara.list_accounting_work` / `clara.get_accounting_work_row` (FROZEN this wave),
--     `clara.trial_balance_as_of`, and the legacy due-date producer at 0040:6008-6018 (left
--     untouched for the coding lane). UNCHANGED.
--   * `journal_entries.coding_kind` is NEVER set by this lane — see measurement 2. Cell
--     `p655.rig.coding_kind_untouched` pins it, which is what keeps
--     `clara._tf_assert_supplier_bill_shape` / `_tf_assert_sales_invoice_shape` and their
--     document-anchored verified-total arms permanently unarmed here.
--   * NO purpose widening (a trade invoice is a `journal_entry`-purpose Work, exactly as #638's
--     claim is), NO part kind, NO needs-you row kind, NO counterparty alias (2026-09-15 D11 —
--     identity provenance is CONSUMED from 0215, never written), NO settlement/allocation door
--     (#657/#662), NO aging surface (#669), NO credit-note shape (#666/#662 — refused BY NAME),
--     NO `p_attestation` and no reachable `is_high_stakes` ceremony (CB-AE2E-013).
-- =====================================================================================

do $w655_pre$
declare v_sha text; v_n int; v_def text; v_names text[];
begin
  if to_regclass('clara.accounting_work') is null then
    raise exception '#655 prestate: clara.accounting_work is absent -- 0178 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.open_items') is null then
    raise exception '#655 prestate: clara.open_items is absent -- 0037 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.counterparty_aliases') is null
     or to_regclass('clara.counterparty_identity_revisions') is null then
    raise exception '#655 prestate: 0215''s identity provenance is absent -- 0215 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.trade_invoices') is not null then
    raise exception '#655 prestate: clara.trade_invoices already exists' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)') is not null then
    raise exception '#655 prestate: a trade-invoice admission door already exists'
      using errcode='CLR10';
  end if;

  -- BOTH purpose CHECKs are at their 0194 THREE-VALUED form, and this file leaves them there.
  foreach v_def in array array['accounting_work_purpose_check','operation_receipts_purpose_check'] loop
    if pg_get_constraintdef((select oid from pg_constraint
          where conrelid = (case when v_def like 'accounting_work%' then 'clara.accounting_work'::regclass
                                 else 'clara.operation_receipts'::regclass end)
            and conname = v_def))
       <> 'CHECK ((purpose = ANY (ARRAY[''journal_entry''::text, ''periodic_stock_adjustment''::text, ''payroll_obligation''::text])))' then
      raise exception '#655 prestate: % is not the 0194 three-valued CHECK', v_def using errcode='CLR10';
    end if;
  end loop;

  -- THE THREE RECUT TARGETS' PRE-IMAGE SHAS, and the FIVE non-regression bodies this file edits
  -- none of. EVERY ONE MEASURED on clara_655 off pg_proc with
  --   select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid = <sig>::regprocedure
  -- after `pnpm db:migrate` took the chain to 0224 — NEVER transcribed from file text. Three of
  -- these bodies are demonstrable splices (`_subledger_on_approve` = 0037 + 0040 + 0041;
  -- `_approve_entry_core` is the NINTH body; `_record_journal_entry_core` is the FIFTH), so a pin
  -- written from any single migration's text would not match and 0225 would refuse to apply.
  for v_def, v_sha in
    select * from (values
      -- RECUT TARGETS (section C derives from these exact texts).
      ('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)',
       'bc24524656e1a47812d12c4db24afde565e2aad3bb60f25d18234c05860838b3'),
      ('clara._subledger_classify_entry(uuid)',
       '9443605db09329fe6998d4d3bdfe5125f64bd5ff52d998b921d688d7c9daa0f1'),
      ('clara._tf_subledger_item_belt()',
       'ba7fe9c16dcc30bb9c99aa3c17809b2bd51ef1b9554fd0f04811edb0d467eba6'),
      -- NON-REGRESSIONS. Nothing below derives from their text; they exist so that applying 0225
      -- on a chain where one has DRIFTED fails loudly HERE rather than letting section F's
      -- re-assertion pass against a body this file never measured.
      ('clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)',
       '10b89677d342a424d5959ded8ad2c8c974c4ff9bdc26f5c0dd6c773a15af2612'),
      ('clara._subledger_on_approve(uuid)',
       '6e37c601ff716e0c73b3061bcb503cc01539f2f237841650657fa2d9600accfd'),
      ('clara._validate_entry_lines(uuid,jsonb)',
       '37b03159a535770d6d7053aa826270703fcafa86f3864e9e344fe5bb886d3c71'),
      ('clara._approve_entry_core(jsonb,uuid,uuid,text,text)',
       'd5ab4afc85f79c2676e047ae1f2a5c622cac81f9877a502ae521531b11a3c637'),
      -- The belt section C's classifier recut exists to keep tied. Pinned because this file's
      -- whole design rests on its exact ARM 1 text.
      ('clara._tf_subledger_entry_belt()',
       'a648d6f57768db8342f5d184650b17801008bf02ff4caee0d2daafa316afad49')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_def) is null then
      raise exception '#655 prestate: % is absent', v_def using errcode='CLR10';
    end if;
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = v_def::regprocedure) <> v_sha then
      raise exception '#655 prestate: % has DRIFTED from its pinned pre-image (expected %, found %) -- 0225 derives the sixth posting core and two additive ladders from these exact texts, so a drift here means a sibling recut landed and the copy below would silently fork it',
        v_def, v_sha, (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
                        where p.oid = v_def::regprocedure)
        using errcode='CLR10';
    end if;
  end loop;

  -- THE SUBLEDGER-HOOK CALLER CENSUS, at 0037:3841-3847's instrument but at the roster the LIVE
  -- catalog holds (SIX — 0216:938-947 re-derived it; 0037's four is a statement about the world of
  -- 0037). Identical before this file runs and after it: #655 adds NO caller.
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='clara' and position('clara._subledger_on_approve(' in p.prosrc) > 0
     and p.proname <> '_subledger_on_approve';
  if v_names is distinct from array['_approve_entry_core','_approve_opening_entry',
                                    'approve_wrong_client_correction','finalize_close',
                                    'reopen_fiscal_year','reverse_entry'] then
    raise exception '#655 prestate: the subledger hook''s callers are % -- expected exactly the SIX 0216 measured', v_names
      using errcode='CLR10';
  end if;

  -- THE `clara.open_items` WRITER CENSUS, BEFORE. 0037:3830-3833 pinned it at ONE; this file makes
  -- it TWO and section F re-pins it. Asked here so "the census was already wrong" can never be
  -- mistaken for "0225 broke it".
  --
  -- THE PROBE CARRIES THE OPENING PAREN, and that is a measurement rather than a flourish: the
  -- looser `insert\s+into\s+clara\.open_items` also matches `clara._tf_subledger_item_belt`, whose
  -- COMMENT quotes the statement it is guarding against ("a LONE `insert into clara.open_items`
  -- against an entry that was approved in some EARLIER transaction"). Measured on clara_655: the
  -- loose form reports TWO writers before this file runs and the paren form reports the ONE that
  -- actually writes.
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='clara' and position('insert into clara.open_items(' in p.prosrc) > 0;
  if v_names is distinct from array['_subledger_on_approve'] then
    raise exception '#655 prestate: the clara.open_items writer set is % -- expected exactly {_subledger_on_approve}', v_names
      using errcode='CLR10';
  end if;

  -- THE BELT THIS FILE'S NEW TRIGGER MUST SORT BEFORE, and the name it must not already carry.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.journal_entries'::regclass and tgname = 't_je_subledger_belt'
     and tgdeferrable and tginitdeferred;
  if v_n <> 1 then
    raise exception '#655 prestate: t_je_subledger_belt is absent or no longer DEFERRABLE INITIALLY DEFERRED -- 0037 must apply first'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.journal_entries'::regclass and tgname = 't_je_open_item_birth';
  if v_n <> 0 then
    raise exception '#655 prestate: t_je_open_item_birth already exists' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._canonical_counterparty(uuid,uuid)') is null
     or to_regprocedure('clara._journal_source_document(jsonb)') is null
     or to_regprocedure('clara._assert_journal_source_refs(uuid,uuid,jsonb,boolean)') is null
     or to_regprocedure('clara._human_ctx(integer)') is null then
    raise exception '#655 prestate: a shared predicate this file calls is absent' using errcode='CLR10';
  end if;
  -- `ix_operation_receipts_entry` is the TEXT-compared index measurement 3 path (2) needs.
  select count(*)::int into v_n from pg_class where relname = 'ix_operation_receipts_entry';
  if v_n <> 1 then
    raise exception '#655 prestate: ix_operation_receipts_entry is absent -- 0178 must apply first'
      using errcode='CLR10';
  end if;

  raise notice '#655 prestate: clean -- no trade-invoice surface exists, both purpose CHECKs carry their 0194 three values, the three recut targets and five non-regression bodies are at their MEASURED pre-image shas, the subledger-hook census is the measured six and the open_items writer census is the pinned one.';
end
$w655_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SECTION A  THE TYPED BUSINESS OBJECT AND ITS STATUS LEDGER.
--
-- WRITTEN AT ADMISSION, NOT AT POSTING — 0221's rule, for 0221's reason. The posting core reads
-- the Work's plain balanced `journal_entry` basis; nobody in the core reads a trade invoice's
-- particulars. So the object has to exist from the moment the intent is admitted, which is also
-- what AC1 asks for: the party, the two dates, the reference, the currency, the exact total, the
-- tax facts and the due-date basis are recorded whether or not the run has posted yet.
--
-- APPEND-ONLY WITH ZERO ADMITTED UPDATES. 0221 admits exactly one (its correction back-stamp);
-- this table admits NONE, because there is no back-stamp to admit — see the next paragraph. The
-- belt is written COLUMN BY COLUMN in the 0221:474-502 idiom "so a future writer cannot quietly
-- widen this by adding a SET".
--
-- THE ENTRY AND THE RECEIPT ARE DERIVABLE BY JOIN, NEVER STORED HERE (0221:350-355, verbatim in
-- rule and reason): `work_id` -> the committed `clara.operation_receipts` row (indexed,
-- `ix_operation_receipts_work`) -> `effects->>'entry_id'` (indexed, `ix_operation_receipts_entry`).
-- "Storing them would need an UPDATE of an append-only row at posting time, which is exactly the
-- shape this table refuses." The STATUS LEDGER below is where the posting moment is recorded, and
-- it carries both ids so section D's trigger and the reads have ONE indexed handle.
--
-- EVERY FOREIGN KEY CARRIES THE TENANT (0182:320-326 / 0194 section C's S4 correction): a
-- single-column `work_id uuid references clara.accounting_work(id)` is satisfied by ANY firm's
-- Work. `source_document_id` is NULLABLE and MATCH SIMPLE, so a documentless chat-stated bill
-- skips the check entirely (0221:344-349).
--
-- `counterparty_id` IS NOT NULL. D12(a): an ambiguous counterparty is refused AT ADMISSION with
-- the candidate list carried verbatim (`party_ambiguous`), so by the time a row exists the party
-- is a fact. That is also what makes the open item's grain computable at birth.
--
-- `currency = 'MYR'` IS A CHECK, not a default: PRD:127 states multi-currency as a boundary, and a
-- column that silently accepted 'SGD' would be a promise the rest of the estate cannot keep.
-- =====================================================================================
create table clara.trade_invoices (
  id                 uuid        primary key default gen_random_uuid(),
  firm_id            uuid        not null references clara.firms(id),
  client_id          uuid        not null,
  work_id            uuid        not null,
  logical_op_id      text        not null check (logical_op_id !~ '^\s*$'),
  kind               text        not null check (kind in ('sales_invoice','supplier_bill')),
  counterparty_id    uuid        not null,
  -- THE DOCUMENT'S OWN DATE, never the posting date and never today. AC6 forbids inventing it.
  document_date      date        not null,
  -- THE DUE DATE AND ITS ORIGIN (D12c). `absent` is a first-class answer: a bill with no stated
  -- terms and a counterparty with none agreed HAS no due date, and inventing one would make every
  -- aging read lie. The two CHECKs below make "absent" and "null" the same fact, structurally.
  due_date           date,
  due_date_source    text        not null
                       check (due_date_source in ('stated','counterparty_terms','absent')),
  reference          text        check (reference is null or btrim(reference) <> ''),
  currency           text        not null check (currency = 'MYR'),
  total_cents        bigint      not null check (total_cents > 0),
  -- OPAQUE, ECHOED, VALIDATED AGAINST NOTHING — the #638 rule for supplied tax facts. Clara
  -- carries what the document or the person stated; she does not recompute Malaysian SST from it.
  tax_facts          jsonb       check (tax_facts is null or jsonb_typeof(tax_facts) = 'object'),
  -- THE SUBMISSION AS ADMITTED, CANONICAL — 0221's `basis` column, for 0221's reason: "so a
  -- replay never has to decide whether a padded account code and a trimmed one are the same
  -- claim". It is the canonical of the RAW submission (before the party is resolved and before the
  -- due date is derived), which is what makes the step-4 replay probe a pure read of what the
  -- caller sent and never a re-ask of the world.
  particulars        jsonb       not null check (jsonb_typeof(particulars) = 'object'),
  source_document_id uuid,
  recorded_by        uuid        not null references clara.users(id),
  on_behalf_of       uuid        references clara.users(id),
  created_at         timestamptz not null default now(),
  constraint ck_trade_invoices_due_after_document
    check (due_date is null or due_date >= document_date),
  constraint ck_trade_invoices_due_absence
    check ((due_date is null) = (due_date_source = 'absent')),
  constraint fk_trade_invoices_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_trade_invoices_work foreign key (work_id, firm_id, client_id)
    references clara.accounting_work(id, firm_id, client_id),
  constraint fk_trade_invoices_counterparty foreign key (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id),
  -- FIRM-WIDE, because `clara.documents` has no client column: the FILING binds a document to a
  -- client, and `clara._assert_journal_source_refs` is what checks THIS client's live filing.
  constraint fk_trade_invoices_document foreign key (source_document_id, firm_id)
    references clara.documents(id, firm_id),
  -- ONE TRADE INVOICE PER WORK, and one per logical operation identity. The first is what makes
  -- the door's `on conflict (work_id) do nothing` a convergence rather than a race; the second is
  -- the structural half of "duplicate / lost acknowledgement / restart yields ONE effect".
  constraint uq_trade_invoices_work unique (work_id),
  constraint uq_trade_invoices_logical unique (logical_op_id),
  constraint uq_trade_invoices_id_firm_client unique (id, firm_id, client_id)
);
comment on table clara.trade_invoices is
  '#655: ONE trade invoice -- a client sales invoice or a supplier bill: which party, which two '
  'dates, which reference, which exact total in sen, which supplied tax facts, and on what basis '
  'the due date was decided. Written ONLY by clara.admit_trade_invoice_work inside the ADMISSION '
  'transaction; append-only with ZERO admitted updates; no application role holds DML. The posted '
  'entry, receipt and open item are DERIVABLE BY JOIN, never stored here.';

create index ix_trade_invoices_client
  on clara.trade_invoices(client_id, document_date desc, created_at desc);
create index ix_trade_invoices_counterparty
  on clara.trade_invoices(counterparty_id, document_date desc);
create index ix_trade_invoices_document
  on clara.trade_invoices(source_document_id) where (source_document_id is not null);

alter table clara.trade_invoices enable row level security;
alter table clara.trade_invoices force row level security;
create policy p_trade_invoices_owner on clara.trade_invoices
  for all to clara_fn_owner using (true) with check (true);
create policy p_trade_invoices_read on clara.trade_invoices
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.trade_invoices to clara_authenticated;
-- clara_runtime gets NOTHING, exactly as it gets nothing on clara.operation_receipts and
-- clara.staff_expense_claims: the run is told its effect by the wake verb's answer, and the web
-- reads the row as the signed-in human.

create function clara._tf_trade_invoice_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a trade invoice is never deleted (reverse it, do not erase it)'
      using errcode='CLR08',
        detail='{"reason":"trade_invoice_immutable","column":"*"}';
  end if;
  -- ZERO ADMITTED UPDATES. Column by column, so a future writer cannot quietly widen this by
  -- adding a SET -- 0221:474-502's idiom, with nothing on the admitted side.
  if new.id is distinct from old.id
     or new.firm_id is distinct from old.firm_id
     or new.client_id is distinct from old.client_id
     or new.work_id is distinct from old.work_id
     or new.logical_op_id is distinct from old.logical_op_id
     or new.kind is distinct from old.kind
     or new.counterparty_id is distinct from old.counterparty_id
     or new.document_date is distinct from old.document_date
     or new.due_date is distinct from old.due_date
     or new.due_date_source is distinct from old.due_date_source
     or new.reference is distinct from old.reference
     or new.currency is distinct from old.currency
     or new.total_cents is distinct from old.total_cents
     or new.tax_facts is distinct from old.tax_facts
     or new.particulars is distinct from old.particulars
     or new.source_document_id is distinct from old.source_document_id
     or new.recorded_by is distinct from old.recorded_by
     or new.on_behalf_of is distinct from old.on_behalf_of
     or new.created_at is distinct from old.created_at then
    raise exception 'a trade invoice is append-only: it records what was claimed, and the posting is recorded on its status ledger'
      using errcode='CLR08',
        detail='{"reason":"trade_invoice_immutable","column":"*"}';
  end if;
  -- A no-op UPDATE changes nothing and is still refused: an append-only row admits no SET at all.
  raise exception 'a trade invoice admits no update'
    using errcode='CLR08', detail='{"reason":"trade_invoice_immutable","column":"*"}';
end $$;
revoke all on function clara._tf_trade_invoice_append_only() from public;
create trigger t_trade_invoices_append_only
  before update or delete on clara.trade_invoices
  for each row execute function clara._tf_trade_invoice_append_only();
create trigger t_trade_invoices_no_truncate before truncate on clara.trade_invoices
  for each statement execute function clara._tf_no_truncate();

-- ---------------------------------------------------------------------------------
-- THE STATUS LEDGER (the 0221:533-556 shape). Append-only, one row per (invoice, state), so every
-- stamp is idempotent by construction and the whole history of one trade invoice reads in one
-- indexed scan.
--
-- `admitted` is written by the door. `posted` is written by the AFTER INSERT trigger on
-- `clara.operation_receipts` below — the moment the effect becomes a fact. `refused` is available
-- for a future lane that records a refusal durably; nothing writes it in 0225, and the CHECK
-- carries it so that lane does not have to widen a constraint on an append-only child.
--
-- IT CARRIES `entry_id` AND `receipt_id` so section D's birth trigger, section C's classifier
-- ladder and the read have ONE indexed handle from an entry back to a trade invoice, rather than
-- re-deriving a jsonb join every time.
-- ---------------------------------------------------------------------------------
create table clara.trade_invoice_status (
  id           uuid        primary key default gen_random_uuid(),
  firm_id      uuid        not null references clara.firms(id),
  client_id    uuid        not null,
  invoice_id   uuid        not null,
  state        text        not null check (state in ('admitted','posted','refused')),
  entry_id     uuid,
  receipt_id   uuid,
  detail       jsonb       not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  recorded_at  timestamptz not null default now(),
  constraint fk_trade_invoice_status_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_trade_invoice_status_invoice foreign key (invoice_id, firm_id, client_id)
    references clara.trade_invoices(id, firm_id, client_id),
  constraint uq_trade_invoice_status unique (invoice_id, state)
);
comment on table clara.trade_invoice_status is
  '#655: the append-only status ledger of one trade invoice. One row per (invoice, state), so '
  'every stamp is idempotent. Written by clara.admit_trade_invoice_work (admitted) and by '
  'clara._tf_trade_invoice_posted (posted). Its posted row is the INDEXED handle from a journal '
  'entry back to its trade invoice.';
create index ix_trade_invoice_status_entry
  on clara.trade_invoice_status(entry_id) where (entry_id is not null);

alter table clara.trade_invoice_status enable row level security;
alter table clara.trade_invoice_status force row level security;
create policy p_trade_invoice_status_owner on clara.trade_invoice_status
  for all to clara_fn_owner using (true) with check (true);
create policy p_trade_invoice_status_read on clara.trade_invoice_status
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.trade_invoice_status to clara_authenticated;

create trigger t_trade_invoice_status_append_only
  before update or delete on clara.trade_invoice_status
  for each row execute function clara._tf_append_only();
create trigger t_trade_invoice_status_no_truncate before truncate
  on clara.trade_invoice_status for each statement execute function clara._tf_no_truncate();

-- ---------------------------------------------------------------------------------
-- THE POSTED STAMP. An `after insert` trigger on `clara.operation_receipts`, NOT a deferred one —
-- 0221:1409-1416's reason, verbatim in structure: the receipt is inserted by
-- `clara._record_journal_entry_core` after the entry is approved, inside the posting transaction,
-- so an immediate AFTER INSERT sees exactly the row it needs and the ledger stamp is part of the
-- same commit. THAT NON-DEFERRAL IS ALSO WHAT MAKES SECTION D'S SUBJECT JOIN WORK: the `posted`
-- row exists before the deferred queue runs.
-- ---------------------------------------------------------------------------------
create function clara._tf_trade_invoice_posted() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_invoice uuid; v_firm uuid; v_client uuid;
begin
  if new.outcome <> 'committed' then return null; end if;
  select ti.id, ti.firm_id, ti.client_id into v_invoice, v_firm, v_client
    from clara.trade_invoices ti where ti.work_id = new.work_id;
  if v_invoice is null then return null; end if;
  insert into clara.trade_invoice_status(firm_id, client_id, invoice_id, state, entry_id,
      receipt_id, detail)
    values (v_firm, v_client, v_invoice, 'posted',
      nullif(btrim(coalesce(new.effects->>'entry_id','')),'')::uuid, new.id,
      jsonb_build_object('logical_op_id', new.logical_op_id, 'on_behalf_of', new.on_behalf_of))
    on conflict (invoice_id, state) do nothing;
  return null;
end $$;
revoke all on function clara._tf_trade_invoice_posted() from public;
create trigger t_operation_receipts_trade_invoice_posted
  after insert on clara.operation_receipts
  for each row when (new.outcome = 'committed')
  execute function clara._tf_trade_invoice_posted();

-- ---------------------------------------------------------------------------------
-- THE ONE SHARED RESOLVER FROM AN ENTRY BACK TO A TRADE INVOICE'S KIND.
--
-- SECTION C's classifier ladder and SECTION C's item belt BOTH need it, and a second copy of this
-- join in a second body is exactly the class of defect the estate's "one classifier" law exists to
-- prevent. Ungranted to every application role.
--
-- PATH (1) OF MEASUREMENT 3, with PATH (2) as the stated fallback. The `posted` status row is the
-- indexed handle; the receipt join is kept because the ledger is "the INDEXED handle and the audit
-- trail, not the only source of truth" (0221:1417-1421), so removing the stamp trigger would
-- degrade this to one extra index scan rather than to silence.
-- ---------------------------------------------------------------------------------
create function clara._trade_invoice_kind_of_entry(p_entry uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(
    (select ti.kind from clara.trade_invoice_status st
       join clara.trade_invoices ti on ti.id = st.invoice_id
      where st.state = 'posted' and st.entry_id = p_entry),
    (select ti.kind from clara.operation_receipts o
       join clara.trade_invoices ti on ti.work_id = o.work_id
      where o.effects->>'entry_id' = p_entry::text and o.outcome = 'committed'));
$$;
revoke all on function clara._trade_invoice_kind_of_entry(uuid) from public;
comment on function clara._trade_invoice_kind_of_entry(uuid) is
  '#655: the ONE resolver from an approved journal entry back to the kind of the trade invoice '
  'that produced it (sales_invoice / supplier_bill), or NULL when no trade invoice did. Used by '
  'clara._subledger_classify_entry LADDER 3T and by clara._tf_subledger_item_belt, so the two can '
  'never disagree. Ungranted to every application role.';

-- =====================================================================================
-- SECTION B  THE PREDICATES AND THE ONE PUBLIC DOOR.
--
-- THE REFUSAL LADDER IS THE CONTRACT (DECISIONS.md:50 — "the count is descriptive, the door's own
-- raise ladder is the contract"). Every token below is a CLR code plus a `detail.reason`, and the
-- runtime module and the chatTurn_v21 stanza carry the SAME strings:
--
--   party_ambiguous · party_unresolved · credit_shape_not_admitted · invalid_total ·
--   unbalanced_basis · control_leg_missing · wrong_control_domain · invalid_due_date ·
--   source_already_posted · client_inactive · insufficient_role · invalid_intent_key ·
--   intent_payload_conflict · period_locked
--
-- AND FOUR MORE THE LADDER MEASURABLY RAISES, named here rather than hidden. The brief fixed the
-- map at FOURTEEN and said "if your measured door ends up raising a fifteenth typed reason, the
-- map grows with it and the report names it"; a bare 22P02/23514 out of a column CHECK is exactly
-- what 0194:1078-1081 forbids, so each of these exists for the same reason the fourth does:
--
--   invalid_kind          a `p_kind` that is neither admitted value and is not credit-shaped
--   invalid_particulars   particulars that are not a JSON object at all
--   invalid_currency      a currency this estate does not record trade invoices in
--   invalid_tax_facts     tax facts sent as something other than an object
--
-- THE LAST THREE ARE SPLIT OUT RATHER THAN FOLDED INTO `invalid_kind` (review finding F2, fix
-- round 1): one reason names ONE thing, or the single sentence the runtime map and the message
-- catalogue render for that token — "a trade invoice is either a sales invoice or a supplier
-- bill" — is false for three of the four failures, and the person is sent to correct the one
-- field that was already right.
-- =====================================================================================

-- ---------------------------------------------------------------------------------
-- THE CANONICAL FORM. The comparable shape the replay probe uses, so a padded reference and a
-- trimmed one, or two spellings of the same date, are never mistaken for two different claims.
-- 0221's `_claim_basis_canonical` precedent.
-- ---------------------------------------------------------------------------------
create function clara._trade_invoice_canonical(p_kind text, p_particulars jsonb, p_basis jsonb)
  returns jsonb language sql immutable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'kind', btrim(coalesce(p_kind,'')),
    'counterparty', jsonb_strip_nulls(jsonb_build_object(
       'id', nullif(btrim(coalesce(p_particulars->'counterparty'->>'id','')),''),
       'name', nullif(btrim(coalesce(p_particulars->'counterparty'->>'name','')),''),
       'registration_no', nullif(btrim(coalesce(p_particulars->'counterparty'->>'registration_no','')),''),
       'tin', nullif(btrim(coalesce(p_particulars->'counterparty'->>'tin','')),''))),
    'document_date', nullif(btrim(coalesce(p_particulars->>'document_date','')),''),
    'due_date', nullif(btrim(coalesce(p_particulars->>'due_date','')),''),
    'reference', nullif(btrim(coalesce(p_particulars->>'reference','')),''),
    'currency', upper(btrim(coalesce(p_particulars->>'currency','MYR'))),
    'total_cents', trunc((coalesce(nullif(btrim(coalesce(p_particulars->>'total_cents','')),''),'0'))::numeric)::bigint,
    'tax_facts', coalesce(p_particulars->'tax_facts','null'::jsonb),
    'posting_date', nullif(btrim(coalesce(p_basis->>'posting_date','')),''),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_code', btrim(coalesce(x.elem->>'account_code','')),
               'debit_cents', trunc((coalesce(nullif(btrim(coalesce(x.elem->>'debit_cents','')),''),'0'))::numeric)::bigint,
               'credit_cents', trunc((coalesce(nullif(btrim(coalesce(x.elem->>'credit_cents','')),''),'0'))::numeric)::bigint,
               'description', btrim(coalesce(x.elem->>'description','')))
             order by x.idx)
      from jsonb_array_elements(coalesce(p_basis->'lines','[]'::jsonb)) with ordinality as x(elem, idx)),
      '[]'::jsonb));
$$;
revoke all on function clara._trade_invoice_canonical(text,jsonb,jsonb) from public;

-- ---------------------------------------------------------------------------------
-- THE PAYLOAD AND WORLD PREDICATES, in ONE body so the door and a later reader can never disagree
-- about what a trade invoice is. `p_world => false` at the cheap check (facts about the payload
-- alone), `true` under the advisory rung (facts about the world that another admission can move).
--
-- UNGRANTED TO EVERY APPLICATION ROLE. A predicate a caller could run directly is an oracle.
-- ---------------------------------------------------------------------------------
create function clara._assert_trade_invoice_basis(p_client uuid, p_kind text, p_particulars jsonb,
    p_basis jsonb, p_world boolean) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_kind text; v_class text; v_other text; v_ctl_n int; v_other_n int;
  v_net bigint; v_total bigint; v_dr bigint; v_cr bigint;
  v_doc date; v_due date; v_src text; v_posting date; v_fy_status text; v_type text;
  v_msg text; v_detail text;
begin
  if p_particulars is null or jsonb_typeof(p_particulars) <> 'object' then
    raise exception 'a trade invoice requires its typed particulars' using errcode='CLR10',
      detail='{"reason":"invalid_particulars","field":"particulars"}';
  end if;
  v_kind := btrim(coalesce(p_kind,''));

  -- 1 · THE CREDIT SHAPE, REFUSED BY NAME AND FIRST (D12b). It is refused BEFORE the `kind` column
  -- CHECK could fire as an unclassifiable 23514 -- 0194:1078-1081 forbids exactly that pattern
  -- ("a 23514 out of the INSERT carries no typed reason and the runtime could not classify it").
  -- The boundary is SPOKEN rather than silent: credit notes and supplier credits are #666/#662's,
  -- and a person who typed one deserves to be told which lane owns it.
  v_type := nullif(btrim(coalesce(p_particulars->'tax_facts'->>'type_code','')),'');
  if v_kind in ('sales_credit_note','supplier_credit_note','purchase_credit_note','credit_note')
     or nullif(btrim(coalesce(p_particulars->>'credit_note_of','')),'') is not null
     or btrim(coalesce(p_particulars->>'document_type','')) in
          ('credit_note','sales_credit_note','supplier_credit_note')
     or v_type = '02' then
    raise exception 'a credit note is not recorded on this lane; record it as a credit against the invoice it corrects'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','credit_shape_not_admitted','kind',v_kind,
          'type_code',v_type)::text;
  end if;
  if v_kind not in ('sales_invoice','supplier_bill') then
    raise exception 'a trade invoice is either a sales invoice or a supplier bill, not %', v_kind
      using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_kind','kind',v_kind)::text;
  end if;

  -- 2 · THE JOURNAL BASIS, through the estate's OWN predicate (0178:693) -- posting_date, memo,
  -- currency, lines. Nothing about a party, a reference or a due date lives there, which is the
  -- whole reason this lane needed a typed object at all.
  --
  -- ITS UNBALANCED REFUSAL IS RE-BADGED INTO THIS DOOR'S OWN LADDER, and that is a door's job
  -- rather than a liberty: `clara._assert_journal_basis` raises CLR10 with
  -- `reason:'invalid_basis', constraint:'balanced'` (MEASURED on clara_655), while this lane's
  -- contract -- the one the runtime module and the chatTurn_v21 stanza carry -- names it
  -- `unbalanced_basis`. Every other refusal it raises is re-raised VERBATIM, detail and message
  -- intact, so nothing else is reshaped on the way out.
  begin
    perform clara._assert_journal_basis(p_basis);
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
    if coalesce(nullif(btrim(coalesce(v_detail,'')),''),'{}') ~ '^\s*\{'
       and coalesce(v_detail::jsonb->>'constraint','') = 'balanced' then
      raise exception '%', v_msg using errcode='CLR10',
        detail=(v_detail::jsonb || jsonb_build_object('reason','unbalanced_basis'))::text;
    end if;
    raise exception '%', v_msg using errcode='CLR10', detail=v_detail;
  end;
  v_posting := (p_basis->>'posting_date')::date;

  -- 3 · THE TOTAL. POSITIVE, INTEGER SEN, and refused as a typed CLR10 BEFORE the column CHECK
  -- `total_cents > 0` could fire as a bare 23514 -- the same 0194:1078-1081 rule. A zero, a
  -- negative and a fractional total all leave under ONE name, because the remedy is one thing:
  -- state the amount the document states.
  if nullif(btrim(coalesce(p_particulars->>'total_cents','')),'') is null then
    raise exception 'a trade invoice states its total in whole sen' using errcode='CLR10',
      detail='{"reason":"invalid_total","field":"total_cents","constraint":"required"}';
  end if;
  begin
    v_total := (p_particulars->>'total_cents')::numeric::bigint;
  exception when others then
    raise exception 'a trade invoice states its total in whole sen' using errcode='CLR10',
      detail='{"reason":"invalid_total","field":"total_cents","constraint":"integer"}';
  end;
  if (p_particulars->>'total_cents')::numeric <> v_total then
    raise exception 'a trade invoice states its total in whole sen, not a fraction of one'
      using errcode='CLR10',
        detail='{"reason":"invalid_total","field":"total_cents","constraint":"integer"}';
  end if;
  if v_total <= 0 then
    raise exception 'a trade invoice states a positive total; a credit is not a negative invoice'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_total','field','total_cents',
          'total_cents',v_total,'constraint','positive')::text;
  end if;

  -- 4 · THE CONTROL LEG. Exactly ONE, of the domain the kind names. `wrong_control_domain` is
  -- raised for a leg of the OPPOSITE control class -- the 0037:1088-1096 rule restated at
  -- admission so it is typed here rather than a commit-time surprise from a belt.
  v_class := case v_kind when 'sales_invoice' then 'receivable' else 'payable' end;
  v_other := case v_kind when 'sales_invoice' then 'payable' else 'receivable' end;
  select count(*) filter (where a.account_class = v_class),
         count(*) filter (where a.account_class = v_other)
    into v_ctl_n, v_other_n
    from jsonb_array_elements(coalesce(p_basis->'lines','[]'::jsonb)) as x(elem)
    join clara.coa_accounts a
      on a.client_id = p_client
     and a.account_code = btrim(coalesce(x.elem->>'account_code',''))
     and a.account_class in ('payable','receivable');
  if v_other_n > 0 then
    raise exception 'a % carries a %-class control leg; the party and the control account disagree about which way the money runs',
      v_kind, v_other
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_control_domain','kind',v_kind,
          'expected_account_class',v_class,'found_account_class',v_other)::text;
  end if;
  if v_ctl_n <> 1 then
    raise exception 'a % carries exactly one %-class control leg; this basis carries %',
      v_kind, v_class, v_ctl_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','control_leg_missing','kind',v_kind,
          'expected_account_class',v_class,'control_leg_count',v_ctl_n)::text;
  end if;

  -- 5 · THE CONTROL LEG'S SIGNED AMOUNT IS THE STATED TOTAL, to the sen. A sales invoice DEBITS
  -- the receivable; a supplier bill CREDITS the payable. The sign convention is the subledger's
  -- own (0037:1012-1026), restated here so the open item the birth trigger mints is the number the
  -- document states and not a derivation nobody checked.
  select coalesce(sum(case when a.account_class = 'receivable'
                           then (coalesce(nullif(btrim(coalesce(x.elem->>'debit_cents','')),''),'0'))::numeric
                              - (coalesce(nullif(btrim(coalesce(x.elem->>'credit_cents','')),''),'0'))::numeric
                           else (coalesce(nullif(btrim(coalesce(x.elem->>'credit_cents','')),''),'0'))::numeric
                              - (coalesce(nullif(btrim(coalesce(x.elem->>'debit_cents','')),''),'0'))::numeric
                      end), 0)::bigint
    into v_net
    from jsonb_array_elements(coalesce(p_basis->'lines','[]'::jsonb)) as x(elem)
    join clara.coa_accounts a
      on a.client_id = p_client
     and a.account_code = btrim(coalesce(x.elem->>'account_code',''))
     and a.account_class = v_class;
  if v_net <> v_total then
    raise exception 'the stated total (% sen) does not match the control leg''s signed amount (% sen)',
      v_total, v_net
      using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_total','field','total_cents',
          'total_cents',v_total,'control_net_cents',v_net,'constraint','control_leg_tie')::text;
  end if;

  -- 6 · BALANCED, EXACT CENTS — A BELT BEHIND A DOOR THAT ALREADY CLOSED, and it is labelled as
  -- one rather than left to read as the reason an unbalanced basis is refused.
  --
  -- MEASURED (ADV-655-5, on clara_655): step 2 above already calls `clara._assert_journal_basis`,
  -- which raises for ANY imbalance (0178:780-783) and whose refusal the re-badge arm converts into
  -- this lane's `unbalanced_basis`. An unbalanced submission (100000 Dr / 106000 Cr) leaves
  -- carrying THAT predicate's own `field`/`constraint` keys, which the raise below does not build
  -- — so nothing reaches this step with v_dr <> v_cr today, and `p655.polarity.matrix(e3)` pins
  -- which arm answers. It is kept because it is the only balance law this door owns: if
  -- `_assert_journal_basis` ever stops asking, the admission must still refuse rather than let an
  -- unbalanced basis become a Work. A belt that never fires is cheap; a hole is not.
  select coalesce(sum((coalesce(nullif(btrim(coalesce(x.elem->>'debit_cents','')),''),'0'))::numeric),0)::bigint,
         coalesce(sum((coalesce(nullif(btrim(coalesce(x.elem->>'credit_cents','')),''),'0'))::numeric),0)::bigint
    into v_dr, v_cr
    from jsonb_array_elements(coalesce(p_basis->'lines','[]'::jsonb)) as x(elem);
  if v_dr <> v_cr then
    raise exception 'the basis does not balance: % sen debited against % sen credited', v_dr, v_cr
      using errcode='CLR10',
        detail=jsonb_build_object('reason','unbalanced_basis','debit_cents',v_dr,
          'credit_cents',v_cr)::text;
  end if;

  -- 7 · THE TWO DATES. The document's own date is required and is never the posting date; a stated
  -- due date may not precede it (D12c).
  if nullif(btrim(coalesce(p_particulars->>'document_date','')),'') is null then
    raise exception 'a trade invoice carries the date the document itself states'
      using errcode='CLR10',
        detail='{"reason":"invalid_due_date","field":"document_date","constraint":"required"}';
  end if;
  v_doc := (p_particulars->>'document_date')::date;
  v_due := nullif(btrim(coalesce(p_particulars->>'due_date','')),'')::date;
  v_src := nullif(btrim(coalesce(p_particulars->>'due_date_source','')),'');
  if v_due is not null and v_due < v_doc then
    raise exception 'the stated due date (%) precedes the document date (%)', v_due, v_doc
      using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_due_date','due_date',v_due,
          'document_date',v_doc,'constraint','not_before_document')::text;
  end if;
  -- THE DECLARATION MUST NOT CONTRADICT ITSELF. The door DERIVES the basis (stated ->
  -- counterparty_terms -> absent) and its derivation wins -- a caller cannot know the
  -- counterparty's terms -- but a caller who says "stated" and states nothing, or says "absent"
  -- and states a date, has sent two different claims in one payload.
  if (v_src = 'stated' and v_due is null) or (v_src = 'absent' and v_due is not null) then
    raise exception 'the due-date basis says % but the payload says otherwise', v_src
      using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_due_date','due_date_source',v_src,
          'due_date',v_due,'constraint','declaration_contradicts_payload')::text;
  end if;
  if upper(btrim(coalesce(p_particulars->>'currency','MYR'))) <> 'MYR' then
    raise exception 'this estate records trade invoices in MYR only' using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_currency','field','currency',
        'currency',btrim(coalesce(p_particulars->>'currency','')))::text;
  end if;
  if p_particulars ? 'tax_facts' and p_particulars->'tax_facts' <> 'null'::jsonb
     and jsonb_typeof(p_particulars->'tax_facts') <> 'object' then
    raise exception 'tax facts are carried as an object, exactly as stated' using errcode='CLR10',
      detail='{"reason":"invalid_tax_facts","field":"tax_facts"}';
  end if;

  if not p_world then return; end if;

  -- ---- THE WORLD HALF ---------------------------------------------------------------------
  -- 8 · THE PERIOD. `clara._tf_period_wall` refuses an approved touch inside a closing/closed
  -- fiscal year at commit; asking the SAME question here (its own steps 2 and 3, by value) makes
  -- the refusal a typed admission answer instead of a wall the run walks into minutes later.
  select fy.status into v_fy_status from clara.fiscal_years fy
   where fy.client_id = p_client and v_posting between fy.starts_on and fy.ends_on
   order by (fy.status in ('closing','closed')) desc, fy.starts_on desc limit 1;
  if v_fy_status in ('closing','closed') then
    raise exception 'the fiscal year containing % is %; nothing new posts into it', v_posting, v_fy_status
      using errcode='CLR19',
        detail=jsonb_build_object('reason','period_locked','posting_date',v_posting,
          'fiscal_year_status',v_fy_status)::text;
  end if;

  -- 9 · THE CONTROL ACCOUNT IS STILL WHAT IT WAS. An account's class can be changed between the
  -- cheap check and the rung; re-asking under the rung is what makes the answer durable.
  select count(*) filter (where a.account_class = v_class),
         count(*) filter (where a.account_class = v_other)
    into v_ctl_n, v_other_n
    from jsonb_array_elements(coalesce(p_basis->'lines','[]'::jsonb)) as x(elem)
    join clara.coa_accounts a
      on a.client_id = p_client
     and a.account_code = btrim(coalesce(x.elem->>'account_code',''))
     and a.account_class in ('payable','receivable')
     and a.is_active;
  if v_other_n > 0 or v_ctl_n <> 1 then
    raise exception 'the control account this % names is no longer an active %-class account of this client',
      v_kind, v_class
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_control_domain','kind',v_kind,
          'expected_account_class',v_class,'active_control_legs',v_ctl_n,
          'opposite_control_legs',v_other_n)::text;
  end if;
end $$;
revoke all on function clara._assert_trade_invoice_basis(uuid,text,jsonb,jsonb,boolean) from public;
comment on function clara._assert_trade_invoice_basis(uuid,text,jsonb,jsonb,boolean) is
  '#655: every payload law of a trade invoice, and (p_world => true) the world laws another '
  'admission can move. Raises the door''s own typed ladder -- credit_shape_not_admitted, '
  'invalid_kind, invalid_particulars, invalid_currency, invalid_tax_facts, invalid_total, '
  'control_leg_missing, wrong_control_domain, unbalanced_basis, invalid_due_date, period_locked '
  '-- never a bare 23514, and never one token for four different failures. Ungranted to every '
  'application role.';

-- ---------------------------------------------------------------------------------
-- THE PARTY, RESOLVED THROUGH 0215's IDENTITY SURFACE (2026-09-15 D11: #655 CONSUMES identity
-- provenance and writes NO alias -- `add_counterparty_alias_for` does not exist and is not this
-- ticket's to build; open #915).
--
-- D12(a): AN AMBIGUOUS PARTY IS REFUSED AT ADMISSION, WITH THE CANDIDATE LIST CARRIED VERBATIM.
-- The person picks in the form or in chat and resubmits. A fact discovered mid-RUN goes through
-- the existing shared question (`claraWork_v4`'s ASK_QUESTION_TOOL), which needs a live task and a
-- hook token (0180:578) that an admission-time ambiguity has not got -- which is exactly why the
-- ambiguity is resolved here and not parked.
--
-- WHAT RESOLVES A PARTY, AND WHAT MERELY TRAVELS WITH IT (ADV-655-8). The resolution keys are, in
-- order: the counterparty id; the normalised registration number; the normalised name or a live
-- alias. `tin` is NOT one of them -- it is accepted on the wire, carried, and echoed in the
-- party_unresolved refusal so the person can see what was tried, and clara.counterparties.tin is
-- read by 0215:1157-1164 only as a cross-client identity WATCH, never as a resolver. A payload
-- whose only identifier is a TIN therefore leaves as party_unresolved even when a counterparty
-- holds that TIN. Adding a TIN arm is a real improvement and a real precedence question (which
-- wins when registration and TIN disagree, and whether a cross-client identifier may resolve
-- inside one client's books); it is filed as a follow-up rather than decided here, and the tool
-- schema's own description now says which keys resolve.
--
-- THE PARTY'S KIND IS THE DOMAIN. A sales invoice is owed BY a customer; a supplier bill is owed
-- TO a vendor. `clara._tf_open_items_validate` enforces the same pairing on the item at birth, so
-- stating it here turns a commit-time CLR10 into an admission-time one with a remedy attached.
-- ---------------------------------------------------------------------------------
create function clara._trade_invoice_resolve_party(p_client uuid, p_kind text, p_particulars jsonb)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_want text; v_id uuid; v_canon uuid; v_row record; v_name text; v_name_n text;
  v_reg text; v_reg_n text; v_tin text; v_n int; v_candidates jsonb;
begin
  v_want := case p_kind when 'sales_invoice' then 'customer' else 'vendor' end;
  v_id := nullif(btrim(coalesce(p_particulars->'counterparty'->>'id','')),'')::uuid;

  -- (a) NAMED BY ID. The canonical survivor is what a merge left behind; reading the stored id raw
  -- would bind history to a party that no longer speaks for itself (0149's rule).
  if v_id is not null then
    v_canon := clara._canonical_counterparty(p_client, v_id);
    select cp.* into v_row from clara.counterparties cp
     where cp.id = v_canon and cp.client_id = p_client
       and cp.merged_into is null and cp.retired_at is null;
    if not found then
      raise exception 'that counterparty is not a live party of this client' using errcode='CLR10',
        detail=jsonb_build_object('reason','party_unresolved','counterparty_id',v_id)::text;
    end if;
    if v_row.kind <> v_want then
      raise exception 'a % is recorded against a %, and this party is a %', p_kind, v_want, v_row.kind
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_control_domain','counterparty_id',v_row.id,
            'counterparty_kind',v_row.kind,'expected_counterparty_kind',v_want,
            'kind',p_kind)::text;
    end if;
    return jsonb_build_object('counterparty_id', v_row.id, 'counterparty_kind', v_row.kind,
      'name', v_row.name, 'payment_terms_days', v_row.payment_terms_days);
  end if;

  -- (b) NAMED BY IDENTITY. Registration number first (the estate's strongest identifier), then the
  -- normalised name and its live aliases -- 0215's own surface, read, never written.
  v_name := nullif(btrim(coalesce(p_particulars->'counterparty'->>'name','')),'');
  v_reg  := nullif(btrim(coalesce(p_particulars->'counterparty'->>'registration_no','')),'');
  v_tin  := nullif(btrim(coalesce(p_particulars->'counterparty'->>'tin','')),'');
  if v_name is null and v_reg is null and v_tin is null then
    raise exception 'a trade invoice names its counterparty' using errcode='CLR10',
      detail='{"reason":"party_unresolved","constraint":"required"}';
  end if;
  v_name_n := lower(regexp_replace(coalesce(v_name,''),'[^a-zA-Z0-9]','','g'));
  v_reg_n  := case when v_reg is null then null
                   else lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;

  if v_reg_n is not null then
    select cp.* into v_row from clara.counterparties cp
     where cp.client_id = p_client and cp.kind = v_want
       and cp.registration_normalized = v_reg_n
       and cp.merged_into is null and cp.retired_at is null
     order by cp.id limit 1;
    if found then
      return jsonb_build_object('counterparty_id', v_row.id, 'counterparty_kind', v_row.kind,
        'name', v_row.name, 'payment_terms_days', v_row.payment_terms_days);
    end if;
  end if;

  -- THE CANDIDATE SET, by normalised name OR a live alias. `distinct` because a party can carry
  -- several aliases that all normalise to the submitted name.
  select count(distinct cp.id)::int into v_n
    from clara.counterparties cp
    left join clara.counterparty_aliases al
      on al.counterparty_id = cp.id and al.retired_at is null
     and al.alias_normalized = v_name_n
   where cp.client_id = p_client and cp.kind = v_want
     and cp.merged_into is null and cp.retired_at is null
     and v_name_n <> '' and (cp.name_normalized = v_name_n or al.id is not null);
  if v_n = 0 then
    raise exception 'no % of this client answers to %', v_want, coalesce(v_name, v_reg, v_tin)
      using errcode='CLR10',
        detail=jsonb_build_object('reason','party_unresolved','name',v_name,
          'registration_no',v_reg,'expected_counterparty_kind',v_want)::text;
  end if;
  if v_n > 1 then
    -- CARRIED VERBATIM (D12a), so the person picks from what the books actually hold rather than
    -- from a summary somebody wrote.
    select jsonb_agg(jsonb_build_object('counterparty_id', c.id, 'name', c.name,
             'registration_no', c.registration_no, 'tin', c.tin) order by c.name, c.id)
      into v_candidates
      from (select distinct cp.id, cp.name, cp.registration_no, cp.tin
              from clara.counterparties cp
              left join clara.counterparty_aliases al
                on al.counterparty_id = cp.id and al.retired_at is null
               and al.alias_normalized = v_name_n
             where cp.client_id = p_client and cp.kind = v_want
               and cp.merged_into is null and cp.retired_at is null
               and (cp.name_normalized = v_name_n or al.id is not null)) c;
    raise exception '% %s of this client answer to %; say which one', v_n, v_want, v_name
      using errcode='CLR10',
        detail=jsonb_build_object('reason','party_ambiguous','name',v_name,
          'expected_counterparty_kind',v_want,'candidates',v_candidates)::text;
  end if;
  select distinct on (cp.id) cp.* into v_row
    from clara.counterparties cp
    left join clara.counterparty_aliases al
      on al.counterparty_id = cp.id and al.retired_at is null
     and al.alias_normalized = v_name_n
   where cp.client_id = p_client and cp.kind = v_want
     and cp.merged_into is null and cp.retired_at is null
     and (cp.name_normalized = v_name_n or al.id is not null);
  return jsonb_build_object('counterparty_id', v_row.id, 'counterparty_kind', v_row.kind,
    'name', v_row.name, 'payment_terms_days', v_row.payment_terms_days);
end $$;
revoke all on function clara._trade_invoice_resolve_party(uuid,text,jsonb) from public;

-- ---------------------------------------------------------------------------------
-- THE DUE DATE AND ITS BASIS (D12c). STATED WINS; the counterparty's agreed terms are the
-- fallback; neither means the due date is honestly ABSENT and the aging read says so rather than
-- inventing one.
--
-- THE TERMS FALLBACK ANCHORS ON THE DOCUMENT DATE -- DECISIONS.md section 6.2.0 R-A (2026-09-19),
-- which OVERRULED this file's first cut. Payment terms are an agreement about how long after the
-- INVOICE the money is due ("30 days net"), so the day the bookkeeper happens to key it in cannot
-- move the money's due date. A bill dated 2026-03-04 and keyed on 2026-03-31 under 30-day terms
-- is due 2026-04-03, not 2026-04-30; anchoring on the posting date would silently give the client
-- 27 extra days of float and tell `ap_aging` an already-overdue bill is current. `document_date`
-- is the column this ticket added for exactly this, and it is REQUIRED by this door (see
-- `clara._assert_trade_invoice_basis`, which raises `invalid_due_date` /
-- `field:"document_date"` / `constraint:"required"` before anything durable).
--
-- THE POSTING DATE IS THE FALLBACK'S OWN FALLBACK, and it is a BELT, not a path. R-A says
-- "posting date only when the document date is absent"; on THIS door the document date can never
-- be absent, so the coalesce's right arm is unreachable from `clara.admit_trade_invoice_work`
-- today (measured: 0225 step 2 and step 7 both run the assert before step 7 calls this). It is
-- written anyway because this function is `immutable` and signature-public inside the schema: a
-- later lane that admits an undated document must get an honest answer out of it rather than a
-- NULL-propagated `absent`.
--
-- THE LEGACY LANE STILL ANCHORS ON THE POSTING DATE. 0040:6010-6015's splice
-- (`posting_date + payment_terms_days`, scoped to `item_kind in ('invoice','bill')`) is the
-- upload/coding lane's producer and this wave leaves it untouched (brief-655.md D12c). R-A calls
-- that the legacy lane's own defect and gives it to #665's cutover. The divergence is therefore a
-- MEASURED, NAMED fact rather than a surprise: `p655.due.anchor_document_date` drives both lanes
-- on one fixture 27 days apart and asserts each number by name, and `p655.parity.source_vs_direct`
-- deliberately uses a fixture whose document date IS its posting date so that the parity claim is
-- about the accounting and not about which anchor won.
-- ---------------------------------------------------------------------------------
create function clara._trade_invoice_due(p_particulars jsonb, p_basis jsonb, p_terms_days int)
  returns jsonb language sql immutable security definer set search_path = clara, pg_temp as $$
  select case
    when nullif(btrim(coalesce(p_particulars->>'due_date','')),'') is not null
      then jsonb_build_object('due_date', btrim(p_particulars->>'due_date'),
                              'due_date_source', 'stated')
    when p_terms_days is not null
      then jsonb_build_object(
             'due_date', to_char(coalesce(
               nullif(btrim(coalesce(p_particulars->>'document_date','')),'')::date,
               (p_basis->>'posting_date')::date) + p_terms_days, 'YYYY-MM-DD'),
             'due_date_source', 'counterparty_terms')
    else jsonb_build_object('due_date', null, 'due_date_source', 'absent')
  end;
$$;
revoke all on function clara._trade_invoice_due(jsonb,jsonb,integer) from public;
comment on function clara._trade_invoice_due(jsonb,jsonb,integer) is
  'THE DUE-DATE LADDER (D12c), anchored per DECISIONS.md 6.2.0 R-A: a STATED due date wins; '
  'otherwise the counterparty''s agreed terms are added to the DOCUMENT date (the posting date '
  'only if no document date was stated, which this lane''s door refuses); otherwise the due date '
  'is honestly absent. The legacy coding/upload lane still anchors on the posting date '
  '(0040:6010-6015) and #665''s cutover owns retiring that -- cell p655.due.anchor_document_date '
  'pins both numbers by name.';

/**
 * clara.admit_trade_invoice_work — THE FOURTH PUBLIC ADMISSION DOOR, AND THE ONLY ONE ON THIS LANE.
 *
 * A SIBLING of `clara.admit_staff_expense_claim_work` (0221:1222) in every respect that matters:
 * `security definer`, actor-explicit (`p_author` is the AUTHORISING HUMAN; membership, role >=
 * bookkeeper and client status are rechecked inside the core), `revoke all ... from public`,
 * `grant execute ... to clara_runtime`.
 *
 * WHY `clara_runtime` AND NOT A `clara_authenticated` TWIN, AND WHY THERE IS NO `_for` SIBLING.
 * 0221:1202-1206 rules it verbatim: "Work admission on this lane is a runtime act OBO a named
 * human -- 0194:1316-1318 grants exactly that ... A second door with a different authority model
 * would be a second answer to 'who admitted this'." The human form goes through
 * `POST /api/work/trade-invoice`, a literal sibling of workRoutes.ts's three, and
 * `apps/web/lib/work/api.ts:1-11` states the same law for the whole lane: admission also ENQUEUES
 * a run, which PostgREST cannot produce. Section F asserts BOTH halves of that negative.
 *
 * BODY ORDER, AND EVERY STEP IS THERE FOR A MEASURED REASON (0221:1207-1220's eight steps):
 *   1. the intent key, first, so a blank key can never own a Work;
 *   2. the AUTHORITY preamble -- including the no-existence-oracle rule. It runs BEFORE the
 *      payload half, which is a MEASURED correction to 0221's order: see the body comment;
 *   3. the PAYLOAD half, before anything durable;
 *   4. the REPLAY probe, BEFORE ANY WRITE -- and the world half is NOT re-asked (0182's lesson:
 *      a property of the world may not refuse a lost-response retry);
 *   5. the WORLD half, asked cheaply;
 *   6. the client rung (house lock order: accounting_plans -> accounting_work -> agent_tasks ->
 *      agent_interruptions);
 *   7. the world half AGAIN, under the rung that makes the answer durable -- 0221's measured
 *      reason: another admission can COMMIT between a cheap check and the write, and the loser
 *      must leave as a typed refusal rather than a raw 23505;
 *   8. the UNCHANGED `clara._admit_accounting_work_core`, THEN the trade_invoices row in the same
 *      transaction with `on conflict (work_id) do nothing` so the core's replay branch converges
 *      here instead of raising, then the `admitted` status row, then `clara._audit` naming THIS
 *      door and not the core.
 *
 * IT IS BORN WITH NO `p_attestation` (CB-AE2E-013). The role authority IS the authority; the
 * `is_high_stakes` ceremony at 0009:1513-1523 is unreachable from here, and section F proves it.
 */
create function clara.admit_trade_invoice_work(p_client uuid, p_author uuid, p_intent_key text,
    p_kind text, p_particulars jsonb, p_basis jsonb, p_basis_origin text, p_source_refs jsonb,
    p_model text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_client_status text; v_role text; v_member_status text;
  v_canon jsonb; v_res jsonb; v_work uuid; v_invoice uuid;
  v_party jsonb; v_due jsonb; v_doc uuid; v_posted_entry uuid;
  v_prior_invoice uuid; v_prior_canon jsonb; v_terms int;
begin
  -- 1 · THE KEY, FIRST (0221:1232-1236; the core's own rule at 0194:1074-1077).
  if p_intent_key is null or p_intent_key ~ '^\s*$' then
    raise exception 'a trade-invoice intent requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_intent_key","constraint":"nonempty"}';
  end if;

  -- 2 · THE AUTHORITY PREAMBLE, BEFORE THE PAYLOAD HALF — and the order is a MEASURED correction
  -- to the eight-step shape #638 established, not a preference.
  --
  -- 0221:1207-1220 puts the payload half at step 2 and authority at step 3, whose stated reason is
  -- that step 8 writes durably and must never run for a caller the core would refuse. That reason
  -- is satisfied by ANY order in which authority precedes the write — and putting the payload half
  -- first reopens the very oracle this preamble exists to close. MEASURED on clara_655 with the
  -- payload half first: an UNKNOWN client id left as CLR10 `control_leg_missing` (the chart lookup
  -- inside `clara._assert_trade_invoice_basis` is client-scoped, so an unknown client has no
  -- control account), while a REAL client of another firm left as CLR11 `client_not_found`. The
  -- difference between those two answers tells an unauthorised caller whether the client exists,
  -- which is exactly what 0194's no-existence-oracle rule forbids. Asking authority first makes
  -- BOTH answer `client_not_found`, indistinguishably — `p655.authority.floors` asserts the two
  -- messages are byte-equal.
  --
  -- The arms, their order and their tokens are the core's own (0194:1089-1116), so the two can
  -- never disagree.
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
    raise exception 'recording a trade invoice requires a bookkeeper or above'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accounting work' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- 3 · THE PAYLOAD HALF, now that the caller has been proved entitled to hear about this client
  -- at all. Still before anything durable, which is 0221's own requirement.
  perform clara._assert_trade_invoice_basis(p_client, p_kind, p_particulars, p_basis, false);
  v_canon := clara._trade_invoice_canonical(p_kind, p_particulars, p_basis);

  -- 4 · THE REPLAY PROBE, BEFORE ANY WRITE. The unique is 0178:336
  -- `uq_accounting_work_intent (firm_id, client_id, intent_key)`. A Work already under this key
  -- resolves to its trade invoice and this door returns the CORE'S OWN replay answer plus that
  -- invoice id, having written NOTHING. The world half below is deliberately NOT re-asked.
  select w.id into v_work from clara.accounting_work w
   where w.firm_id = v_firm and w.client_id = p_client and w.intent_key = p_intent_key;
  if v_work is not null then
    select ti.id, ti.particulars into v_prior_invoice, v_prior_canon
      from clara.trade_invoices ti where ti.work_id = v_work;
    if v_prior_invoice is null then
      -- The key belongs to a Work that is NOT a trade invoice. Answering "replayed" would hand
      -- the caller a Work whose basis is not the one they submitted (0221:1278-1285).
      raise exception 'this intent key already carries a different accounting work'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','intent_payload_conflict','work_id',v_work,
          'field','kind')::text;
    end if;
    -- A PURE READ OF WHAT THE CALLER SENT, compared against what the caller sent LAST time. The
    -- world is not consulted at all here -- no party is re-resolved, no fiscal year re-read -- so
    -- a lost-response retry can never be refused for a reason that has nothing to do with the
    -- retry (0182's rule, restated at 0221:1271-1296).
    if v_prior_canon is distinct from v_canon then
      raise exception 'this intent key already carries a different trade invoice'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','intent_payload_conflict','work_id',v_work,
          'invoice_id',v_prior_invoice,'field','particulars')::text;
    end if;
    v_res := clara._admit_accounting_work_core(p_client, p_author, p_intent_key, 'journal_entry',
      p_basis, null, p_basis_origin, p_source_refs, p_model);
    return v_res || jsonb_build_object('invoice_id', v_prior_invoice);
  end if;

  -- 5 · THE WORLD HALF, ASKED CHEAPLY (0221:1298-1300): before any lock, so an obviously
  -- impossible invoice never queues behind another client's admission. It is NOT the answer that
  -- counts -- step 7 asks again.
  perform clara._assert_trade_invoice_basis(p_client, p_kind, p_particulars, p_basis, true);
  perform clara._trade_invoice_resolve_party(p_client, p_kind, p_particulars);
  v_doc := clara._journal_source_document(p_source_refs);
  if v_doc is not null then
    v_posted_entry := clara._document_posting_entry(p_client, v_doc);
    if v_posted_entry is not null then
      raise exception 'that document already backs a posted journal entry' using errcode='CLR13',
        detail=jsonb_build_object('reason','source_already_posted','document_id',v_doc,
          'entry_id',v_posted_entry)::text;
    end if;
  end if;

  -- 6 · THE RUNG (0221:1302-1326), respecting the house lock order.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- 7 · THE WORLD HALF AGAIN, UNDER THE RUNG. 0221's measured reason, restated: another admission
  -- can COMMIT between step 5 and here -- a fiscal year sealed, a control account reclassed, a
  -- counterparty merged or a document posted against -- and the loser must leave as a TYPED
  -- refusal rather than as a raw 23505 the runtime cannot classify.
  perform clara._assert_trade_invoice_basis(p_client, p_kind, p_particulars, p_basis, true);
  v_party := clara._trade_invoice_resolve_party(p_client, p_kind, p_particulars);
  if v_doc is not null then
    v_posted_entry := clara._document_posting_entry(p_client, v_doc);
    if v_posted_entry is not null then
      raise exception 'that document already backs a posted journal entry' using errcode='CLR13',
        detail=jsonb_build_object('reason','source_already_posted','document_id',v_doc,
          'entry_id',v_posted_entry)::text;
    end if;
  end if;
  v_terms := (v_party->>'payment_terms_days')::int;
  v_due := clara._trade_invoice_due(p_particulars, p_basis, v_terms);
  -- THE DDL CONSTRAINT `ck_trade_invoices_due_after_document`, RESTATED AS A TYPED REFUSAL BEFORE
  -- THE INSERT COULD RAISE A BARE 23514 (0194:1078-1081's rule). Since R-A moved the terms anchor
  -- to the document date and `clara.counterparties.payment_terms_days` is CHECKed 1..365
  -- (0040:754-760), a DERIVED date is now always strictly after the document date, so this arm is
  -- reachable only from a STATED date -- which `clara._assert_trade_invoice_basis` already refused
  -- at step 2 with its own `constraint:"not_before_document"`. It is kept as the belt it is: this
  -- door owns the derivation, so it owns the law about what the derivation may produce.
  if (v_due->>'due_date') is not null
     and (v_due->>'due_date')::date < (p_particulars->>'document_date')::date then
    raise exception 'the counterparty''s agreed terms put the due date (%) before the document date (%)',
      v_due->>'due_date', p_particulars->>'document_date'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_due_date','due_date',v_due->>'due_date',
          'due_date_source',v_due->>'due_date_source',
          'document_date',p_particulars->>'document_date',
          'constraint','not_before_document')::text;
  end if;

  -- 8 · THE UNCHANGED CORE (0221:1327-1333), then the typed row in the SAME transaction.
  -- `purpose => 'journal_entry'` and `p_adjustment => null`: a trade invoice rides the purpose
  -- that can actually post, exactly as #638's claim does. The core mints the Work id itself
  -- (0194:1231) and answers a repeated key with `replayed:true` and the SAME id, which is why the
  -- typed row can only be written AFTER it returns.
  v_res := clara._admit_accounting_work_core(p_client, p_author, p_intent_key, 'journal_entry',
    p_basis, null, p_basis_origin, p_source_refs, p_model);
  v_work := (v_res->>'work_id')::uuid;

  insert into clara.trade_invoices(firm_id, client_id, work_id, logical_op_id, kind,
      counterparty_id, document_date, due_date, due_date_source, reference, currency, total_cents,
      tax_facts, particulars, source_document_id, recorded_by, on_behalf_of)
    values (v_firm, p_client, v_work, v_res->>'logical_op_id', btrim(p_kind),
      (v_party->>'counterparty_id')::uuid,
      (p_particulars->>'document_date')::date,
      nullif(btrim(coalesce(v_due->>'due_date','')),'')::date,
      v_due->>'due_date_source',
      nullif(btrim(coalesce(p_particulars->>'reference','')),''),
      upper(btrim(coalesce(p_particulars->>'currency','MYR'))),
      (p_particulars->>'total_cents')::numeric::bigint,
      case when p_particulars->'tax_facts' = 'null'::jsonb then null
           else p_particulars->'tax_facts' end,
      v_canon, v_doc, p_author, p_author)
    on conflict (work_id) do nothing;

  -- 8b · THE CONCURRENT-RACE RE-READ, and it is the door's only honest answer to a pair that
  -- raced. `on conflict (work_id) do nothing` converges the CORE's replay branch onto one row --
  -- but "converges" and "agrees" are different claims. Step 4's particulars comparison runs on the
  -- UNLOCKED path, so two admissions under one key are BOTH past it before either commits; after
  -- the rung this door delegates conflict detection to `clara._admit_accounting_work_core`, which
  -- compares basis digest / purpose / source_refs / adjustment (0194:1171-1190) and can see
  -- NOTHING of the counterparty, the reference, the two dates, the total or the tax facts -- i.e.
  -- nothing of the typed half this lane exists to record. So the row that SURVIVED is read back
  -- and compared against what THIS caller sent, exactly as the core re-reads its own race
  -- (0194:1239-1256).
  --
  -- MEASURED on clara_655 before this arm existed (p655.replay.race's divergent arm): two
  -- admissions under one key with different parties BOTH left as success, the loser's invoice was
  -- silently discarded by the `do nothing`, and the loser was answered the WINNER's invoice_id
  -- folded together with its OWN kind / counterparty_id / due_date -- an answer describing an
  -- object the database does not hold, and the Work then posts the winner's bill.
  select ti.id, ti.particulars into v_invoice, v_prior_canon
    from clara.trade_invoices ti where ti.work_id = v_work;
  if v_prior_canon is distinct from v_canon then
    raise exception 'this intent key already carries a different trade invoice'
      using errcode='CLR10',
      detail=jsonb_build_object('reason','intent_payload_conflict','work_id',v_work,
        'invoice_id',v_invoice,'field','particulars')::text;
  end if;

  insert into clara.trade_invoice_status(firm_id, client_id, invoice_id, state, detail)
    values (v_firm, p_client, v_invoice, 'admitted',
      jsonb_build_object('admitted_by', p_author, 'kind', btrim(p_kind),
        'due_date_source', v_due->>'due_date_source',
        'counterparty_id', v_party->>'counterparty_id'))
    on conflict (invoice_id, state) do nothing;

  perform clara._audit(v_firm, p_author, null, null, 'admit_trade_invoice_work', null,
    jsonb_build_object('client', p_client, 'work', v_work, 'invoice', v_invoice,
      'logical_op_id', v_res->>'logical_op_id', 'intent_key', p_intent_key,
      'kind', btrim(p_kind), 'counterparty_id', v_party->>'counterparty_id',
      'due_date_source', v_due->>'due_date_source',
      'total_cents', (p_particulars->>'total_cents')::numeric::bigint));

  return v_res || jsonb_build_object('invoice_id', v_invoice,
    'kind', btrim(p_kind),
    'counterparty_id', v_party->>'counterparty_id',
    'due_date', v_due->>'due_date',
    'due_date_source', v_due->>'due_date_source');
end $$;
revoke all on function clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text) from public;
grant execute on function clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text) to clara_runtime;
comment on function clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text) is
  '#655: admit ONE trade invoice (a client sales invoice or a supplier bill) as durable accounting '
  'work. clara_runtime ONLY -- the lane clara.admit_journal_work, clara.admit_periodic_adjustment_work '
  'and clara.admit_staff_expense_claim_work sit in -- acting OBO the named p_author. The Work''s '
  'purpose is journal_entry; the typed invoice lives in clara.trade_invoices, written in this same '
  'transaction. Idempotent on (firm, client, intent_key). Carries NO p_attestation.';

-- =====================================================================================
-- SECTION C  THE THREE RECUTS. Each is a FULL copy of the body the prestate pinned, with the
-- named insertions and NOTHING else. Every carried line is byte-identical to its pre-image.
--
-- C.1 · clara._record_journal_entry_core — THE SIXTH FULL COPY.
--   Creation → splice history: born 0178:1223 → 0182:763 → 0184:860 → 0194:1364 → 0195:1685 →
--   live 0204:152-761 (the FIFTH). Three insertions, all marked `#655`:
--     1. the trade-invoice lookup, one indexed read on uq_trade_invoices_work;
--     2. the control-leg refusal made conditional on that lookup finding nothing, plus the
--        invoice's own control-leg law;
--     3. the party stamp on the control lines, AFTER the line insert.
--   It writes NO back-pointer into clara.trade_invoices — 0221:350-355's rule and its reason:
--   "THE ENTRY AND THE RECEIPT ARE DERIVABLE BY JOIN, NEVER STORED HERE ... Storing them would
--   need an UPDATE of an append-only row at posting time, which is exactly the shape this table
--   refuses."
--   The purpose filter at 0204:178-181 is carried VERBATIM, or 0194:2180's position() probe fails
--   on the from-scratch chain.
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
  v_rev_occ uuid; v_rev_plan uuid; v_rev_period date; v_rev_entry uuid;   -- #787
  v_rev_primary_due date;                                                 -- #787
  v_ti_id uuid; v_ti_kind text; v_ti_party uuid;                          -- #655
  v_ctl_class text; v_ctl_other text; v_ctl_n int; v_ctl_wrong int;       -- #655
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

  -- ---- #631 INSERTION · MODEL EGRESS AUTHORISATION, VERIFIED AGAIN AT THE WRITE -------------
  -- AC2's second half, and it is a SEPARATE question from the role, the client and the period
  -- arms around it: those ask whether this HUMAN may post, and this asks whether the MODEL that
  -- produced the posting was authorised to see the client's books at all. The run consumed an
  -- authorization immediately before it called the model (`claraWork_v3`); this is the
  -- independent re-read of that fact at the moment the books actually move.
  --
  -- WHERE IT SITS, AND WHY EXACTLY HERE. AFTER the cancel arms, the identity arm, the human's
  -- live authority and the client's status, so every one of those keeps its own diagnosis: a
  -- cancelled Work still answers `work_cancelled`, an archived client still answers
  -- `client_inactive`, and a lost membership still answers `obo_not_active` (measured on the rig
  -- -- an earlier cut placed this arm at 1b and stole `client_inactive` from
  -- work-journal-post.test.mjs's own cell). BEFORE `clara._reserve_op`, so a refusal leaves the
  -- logical identity UNSPENT and a human's Retry can still use it.
  --
  -- SKIPPED FOR A COMMITTED REPLAY, for the reason 0184's cancel arms are conditional: a run that
  -- COMMITTED and then died before checkpointing re-executes its step and must get its ORIGINAL
  -- receipt back. An unconditional gate would refuse that replay the moment the authorization had
  -- been invalidated in between, turning a committed effect into an unreadable one.
  --
  -- BOUND TO THIS RUN, not merely to this client. `clara._work_egress_event_seq(work, run)` is
  -- re-derived here from two values this core already holds, so a sibling run's spent
  -- authorization does not satisfy this one and a forged event seq would have to agree with a
  -- hash the database computes twice.
  --
  -- CONSUMED AND NOT INVALIDATED. A PREPARED authorization is a plan, not a dispatch; an
  -- invalidated one is a withdrawal that landed in the window. Neither is authority.
  --
  -- AND THE AUTHORITY BEHIND IT MUST STILL BE LIVE AT THIS INSTANT. The two joins below are the
  -- retroactive half of a withdrawal, and they are this file's answer to "is a revoke retroactive
  -- to an already-consumed dispatch?" — YES (see the header's own statement of the rule). The
  -- first cut checked only the authorization row, and 0020's
  -- `ck_egress_dispatch_authorizations_one_terminal` forbids a CONSUMED row from also being
  -- INVALIDATED, so an owner's withdrawal could not reach it and consume -> revoke -> post
  -- succeeded (measured by the review). Reading the consent and the activation HERE costs two
  -- index lookups in the posting path and makes "authority must be live when the books move"
  -- true without recutting a relation four other purposes share.
  --
  -- AND A RUN CLAIMED UNDER A PRE-v3 BUNDLE IS GRANDFATHERED PAST ALL OF IT. THE RULING, and it
  -- is stated verbatim in this file's header with the measurement and the two options it beat:
  --
  --   A Work whose run was claimed under a PRE-v3 bundle (`accounting_work.bundle->>'id'` is
  --   `clara-work/v1` or `clara-work/v2` — the FROZEN manifest `clara.claim_work_run` stamped on
  --   the Work row at claim) is GRANDFATHERED: this core does not require a consumed
  --   `accounting_work` authorization for it. The wall applies in full from the v3 bundle id on.
  --
  -- WHY A RUN CAN NEED IT. `clara.prepare_work_egress_dispatch` / `clara.consume_egress_dispatch`
  -- are called from ONE non-test site in the repository — `claraWork.v3.impl.ts:280,291` — and
  -- v1 and v2 are FROZEN bodies that can never gain the call. Without this conjunct every Work
  -- already parked on `claraWork_v1`/`claraWork_v2` when 0195 applies is unpostable forever: it
  -- resumes into its own body inside the new image and dies HERE, at the write, after the model
  -- call it was refused authority for has already happened. #637's two-build drill measured
  -- exactly that at v2->v3 (task `failed`/`internal`, zero receipts, zero trace rows).
  --
  -- THE ID IS THE WORK ROW'S OWN, NEVER A PARAMETER. `w.bundle` was written by
  -- `clara.claim_work_run` (0178) from the body's own frozen manifest at claim time and
  -- `clara.accounting_work` is immutable by trigger thereafter, so a run cannot nominate itself
  -- into the grandfathered set: the posting caller supplies `p_bundle_digest`, and this arm does
  -- not read it.
  --
  -- FAIL-CLOSED, AND THE SET IS CLOSED AT TWO. `coalesce(...,'')` makes a Work with NO bundle
  -- stamp (never claimed) WALLED rather than exempt, an unknown id is walled, and the v3 id and
  -- every successor are walled. The tail census re-reads this body and refuses a THIRD
  -- `clara-work/vN` literal ANYWHERE in it -- which is why this comment names v3 by version
  -- rather than by id.
  if clara._work_committed_receipt(p_work) is null
     and coalesce(w.bundle->>'id','') <> all (array['clara-work/v1','clara-work/v2'])
     and not exists (
    select 1 from clara.egress_dispatch_authorizations ea
      join clara.client_egress_purpose_consents cc
        on cc.id = ea.consent_id and cc.firm_id = ea.firm_id and cc.client_id = ea.client_id
          and cc.purpose = ea.purpose
      join clara.client_egress_purpose_activations ca
        on ca.id = ea.activation_id and ca.firm_id = ea.firm_id and ca.client_id = ea.client_id
          and ca.purpose = ea.purpose
     where ea.firm_id = p_firm and ea.client_id = p_client
       and ea.purpose = 'accounting_work'
       and ea.event_type = 'work.segment'
       and ea.event_seq = clara._work_egress_event_seq(p_work, p_run_id)
       and ea.consumed_at is not null and ea.invalidated_at is null
       and cc.revoked_at is null and ca.deactivated_at is null) then
    raise exception 'this run holds no consumed model-egress authorisation for this client'
      using errcode='CLR13', detail='{"reason":"egress_not_authorized"}';
  end if;
  -- ---- #631 INSERTION ends -----------------------------------------------------------------

  -- ---- #787 INSERTION · A PLAN'S REVERSAL MAY NOT POST ONCE ITS ACCRUAL STOPPED BEING LIVE ---
  -- THE RESIDUAL #640 MEASURED, ACCEPTED AND FILED, CLOSED HERE. 0193's admission wall reads the
  -- accrual's liveness ONCE, when the reversal occurrence is admitted, and NOTHING read it again
  -- before the books moved. So: the accrual posts; the scan admits its reversal and writes that
  -- entry id onto `accounting_plan_occurrences.reverses_entry_id`; a human calls
  -- `clara.reverse_entry` on the accrual (a legitimate correction); nothing revokes the
  -- already-admitted reversal Work -- and its post SUCCEEDED, putting a SECOND reversal of one
  -- accrual on the books. Measured by the #640 re-check
  -- (docs/plan/active/refresh-wave-2026-09-14/reports/640-review-recheck.md) and reproduced RED
  -- by `p640.occ.reversal_post_liveness` before this file existed.
  --
  -- THE PREDICATE IS 0193'S OWN, CALLED RATHER THAN RE-SPELLED. `clara._plan_primary_entry` is
  -- what the scan and the catch-up door ask, and it answers with the accrual's entry only while
  -- that entry is APPROVED and NOT ITSELF REVERSED. A post-time check on `reversed_by` alone
  -- would be a WEAKER wall than the one this arm exists to re-assert, and two spellings of one
  -- law drift. The occurrence is single-valued for a Work (`uq_plan_occurrences_work`), its
  -- period key is its ACCRUAL's (0193's header), and `unique (plan_id, leg, period_key)` makes
  -- the accrual occurrence behind it exactly one row -- so the primary due date is READ FROM
  -- STORAGE rather than re-derived from schedule arithmetic a later revision may legitimately
  -- move.
  --
  -- IT FAILS CLOSED. A reversal occurrence whose accrual occurrence is no longer there at all is
  -- refused by the same arm: the ground the admission stood on is gone, and posting into that is
  -- exactly the phantom this closes.
  --
  -- NON-REVERSAL POSTINGS ARE UNTOUCHED. The whole arm is inside "this Work was initiated by a
  -- plan occurrence whose leg is `reversal`"; a Work no occurrence names reads one indexed row
  -- and falls straight through.
  --
  -- SKIPPED FOR A COMMITTED REPLAY, exactly as 0184's cancel arms and 0195's egress gate are: a
  -- run that COMMITTED and then died before checkpointing re-executes its step, reaches this core
  -- again, and must be answered with its STORED result rather than refused. An unconditional wall
  -- here would turn a committed effect into an unreadable one the moment a human reversed the
  -- accrual afterwards -- breaking the one idempotency guarantee 0178 was built for.
  --
  -- WHERE IT SITS: after 0195's egress gate and BEFORE `clara._reserve_op`, so every arm above
  -- keeps its own diagnosis and a refusal leaves the logical identity UNSPENT -- a human's Retry,
  -- or a re-admission behind a live accrual, can still use it.
  --
  -- THE TYPING IS CLR10, AND IT IS NOT FREE (#787's own "out of scope": no frozen closure may be
  -- edited to classify this). The deployed repair router is keyed on `(errcode, detail.reason)`:
  -- an unrecognised CLR13 reason falls to `state_changed`, which hands the model another turn and
  -- burns the run's replan budget against a wall it can never pass (`budget_exhausted -> failed`),
  -- while an unrecognised CLR10 reason falls to `refusal` -- TERMINAL for the loop, settling the
  -- Work `refused` with the database's own typed reason and leaving a human a readable Retry.
  -- Read back from the router itself by
  -- `packages/runtime/tests/work-errors-plan-reversal.test.mjs`.
  --
  -- AND THE WORDS ARE THE ADMISSION SIDE'S. The plan lane already names this exact fact when it
  -- refuses at admission: reason `reversal_before_primary`, `primary_state` `entry_not_live`
  -- (0193's own `clara._plan_admit_occurrence`). One fact, one name.
  if clara._work_committed_receipt(p_work) is null then
    select o.id, o.plan_id, o.period_key, o.reverses_entry_id
      into v_rev_occ, v_rev_plan, v_rev_period, v_rev_entry
      from clara.accounting_plan_occurrences o
     where o.work_id = p_work and o.leg = 'reversal';
    if v_rev_occ is not null then
      select o2.due_date into v_rev_primary_due
        from clara.accounting_plan_occurrences o2
       where o2.plan_id = v_rev_plan and o2.leg = 'primary' and o2.period_key = v_rev_period;
      if v_rev_primary_due is null
         or clara._plan_primary_entry(v_rev_plan, v_rev_primary_due) is distinct from v_rev_entry then
        raise exception 'the accrual this plan reversal was admitted to undo is no longer a live entry'
          using errcode='CLR10',
            detail=jsonb_build_object('reason','reversal_before_primary',
              'primary_state','entry_not_live', 'entry_id', v_rev_entry,
              'occurrence_id', v_rev_occ)::text;
      end if;
    end if;
  end if;
  -- ---- #787 INSERTION ends ------------------------------------------------------------------

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
  -- ---- #655 INSERTION 1 · THE ONE NARROW DOOR IN THE CONTROL-LEG RULE --------------------
  -- D11: 切第六次，只开一条极窄的口. The refusal above stands byte for byte UNLESS this Work
  -- carries a `clara.trade_invoices` row — a typed object with a RESOLVED party, a document date,
  -- an admitted kind and a stated total, written durably at admission by
  -- `clara.admit_trade_invoice_work`. The arm's own stated ground is that "a documentless generic
  -- basis is the weakest anchor in the estate, and a weak anchor may not corroborate a subledger
  -- consequence": a trade invoice is not that anchor, and it is the ONLY thing that opens this.
  --
  -- THE LOOKUP IS ONE INDEXED READ (uq_trade_invoices_work) and leaves v_ti_id NULL for every
  -- other Work in the estate, which is what makes every other arm of this body unmoved.
  select ti.id, ti.kind, ti.counterparty_id into v_ti_id, v_ti_kind, v_ti_party
    from clara.trade_invoices ti where ti.work_id = p_work;
  -- ---- #655 INSERTION 1 ends --------------------------------------------------------------
  select a.account_code into v_bad_code from clara.coa_accounts a
   where a.client_id = p_client and a.account_class in ('payable','receivable')
     and a.account_code in (select x.elem->>'account_code'
                              from jsonb_array_elements(v_canon->'lines') as x(elem))
   order by a.account_code limit 1;
  if v_bad_code is not null and v_ti_id is null then
    raise exception 'a generic journal entry may not carry the control-account leg %', v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','generic_control_leg',
        'account_code', v_bad_code)::text;
  end if;
  -- ---- #655 INSERTION 2 · THE TRADE INVOICE'S OWN CONTROL-LEG LAW, AT COMMIT --------------
  -- Admission asserted this (clara._assert_trade_invoice_basis step 4/5). It is asked AGAIN here
  -- for 7b's own reason: seconds or minutes pass before a run reaches this line, and in that
  -- window an account can be reclassed or retired. The invoice's KIND decides the domain —
  -- sales_invoice ⇒ receivable, supplier_bill ⇒ payable — and a basis that names the opposite
  -- control class, or more than one control leg, is refused BY NAME rather than left to the
  -- subledger belts to discover at commit as an untied entry.
  if v_ti_id is not null then
    v_ctl_class := case v_ti_kind when 'sales_invoice' then 'receivable' else 'payable' end;
    v_ctl_other := case v_ti_kind when 'sales_invoice' then 'payable' else 'receivable' end;
    select count(*) filter (where a.account_class = v_ctl_class),
           count(*) filter (where a.account_class = v_ctl_other)
      into v_ctl_n, v_ctl_wrong
      from jsonb_array_elements(v_canon->'lines') as x(elem)
      join clara.coa_accounts a
        on a.client_id = p_client and a.account_code = x.elem->>'account_code'
       and a.account_class in ('payable','receivable');
    if v_ctl_wrong > 0 or v_ctl_n <> 1 then
      raise exception 'a % admits exactly one %-class control leg; this basis carries % of that class and % of the other',
        v_ti_kind, v_ctl_class, v_ctl_n, v_ctl_wrong
        using errcode='CLR10', detail=jsonb_build_object('reason','wrong_control_domain',
          'kind', v_ti_kind, 'expected_account_class', v_ctl_class,
          'control_leg_count', v_ctl_n, 'opposite_control_legs', v_ctl_wrong)::text;
    end if;
  end if;
  -- ---- #655 INSERTION 2 ends --------------------------------------------------------------

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
  -- ---- #655 INSERTION 3 · THE PARTY STAMP, AFTER THE INSERT --------------------------------
  -- It has to be after, and that is a measured fact rather than a style choice:
  -- `clara._validate_entry_lines` (0009:295-299) drops EVERY key but account_code / debit_cents /
  -- credit_cents / description, so a counterparty carried on the basis line never reaches
  -- `clara.journal_lines` at all. This is `clara._approve_entry_core`'s own idiom
  -- (0037:1885-1888), applied to the party the TYPED OBJECT names — never to a party guessed from
  -- the basis. Without it `clara._assert_control_leg_counterparty_at` refuses the entry CLR23
  -- ("every control-class line requires a counterparty") and the open item would have no grain.
  if v_ti_id is not null then
    update clara.journal_lines l set counterparty_id = v_ti_party
      from clara.coa_accounts a
     where l.entry_id = v_entry and a.client_id = l.client_id
       and a.account_code = l.account_code
       and a.account_class in ('payable','receivable');
  end if;
  -- ---- #655 INSERTION 3 ends --------------------------------------------------------------
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


-- =====================================================================================
-- C.2 · clara._subledger_classify_entry — LADDER 3T. See this file's MEASUREMENT 2.
-- =====================================================================================

CREATE OR REPLACE FUNCTION clara._subledger_classify_entry(p_entry uuid)
 RETURNS TABLE(domain text, counterparty_id uuid, item_kind text, amount_cents bigint, opening_item_id uuid, reversal_unwind_of uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare e record; v_kind text; v_ti_kind text;   -- #655
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;

  -- LADDER 1 -- REVERSAL. Negate every item of the ORIGINAL. Keyed on reversal_of, never on
  -- a copied coding_kind: reverse_entry deliberately does not copy the kind onto a mirror
  -- (Wave-C contract section 3 trap), and copying it would make a leg-flipped mirror fail the
  -- typed shape floors. The original's status join is not defensive padding -- an opening
  -- entry can be WITHDRAWN after its draft-time opening_items row exists (0017:3463-3471),
  -- so every subledger read in this migration joins status='approved'.
  --
  -- CANONICALISED AND AGGREGATED PER PARTY. The original's items store the counterparty that
  -- was canonical AT WRITE TIME; a merge_counterparties performed afterwards does NOT repoint
  -- history, exactly as it does not for journal_lines. Reading the stored id raw would emit
  -- an unwind row under a merged-away party while every other ladder (and the mirror's own
  -- control legs) speaks the canonical one -- so the belts would refuse the mirror with a
  -- wrong diagnosis and reverse_entry would be permanently wedged for that entry. The
  -- TWO-PARTY COLLAPSE follows from the same law: if the original carried items for A and B
  -- and A was later merged into B, ONE canonical party now owes the whole thing, so the
  -- negation is aggregated per canonical party (min(oi.id) carries the lineage of the
  -- collapsed set) and a set that nets to zero produces no row at all -- the same
  -- zero-net-drop every other ladder applies, and required here because amount_cents <> 0 is
  -- a CHECK.
  if e.reversal_of is not null then
    return query
      select oi.domain,
             clara._canonical_counterparty(e.client_id, oi.counterparty_id) as cp,
             'reversal_unwind'::text,
             (-sum(oi.amount_cents))::bigint,
             null::uuid,
             -- min(uuid) is not an aggregate in PostgreSQL 17; the house idiom for a
             -- deterministic pick is the text cast (0035:196 uses the same form).
             min(oi.id::text)::uuid
      from clara.open_items oi
      join clara.journal_entries orig on orig.id = oi.entry_id
      where oi.entry_id = e.reversal_of and orig.status = 'approved'
      group by 1, 2
      having sum(oi.amount_cents) <> 0
      order by 1, 2;
    return;
  end if;

  -- LADDER 2 -- OPENING. Items come from the control-leg NETS, exactly like every other
  -- path; opening_items supplies LINEAGE ONLY and is never an independent row source. That
  -- is the whole reason the backfill is entries-driven: the GL is the tie target, so
  -- anything that is not derived from journal_lines cannot be tied to it.
  -- opening_item_id is NULLABLE: a K6 replacement mirror gets no opening_items row at all
  -- (0017:4105-4118).
  if e.is_opening_balance then
    return query
      with nets as (
        select case a.account_class when 'receivable' then 'ar' else 'ap' end as dom,
               clara._canonical_counterparty(e.client_id, l.counterparty_id) as cp,
               sum(case when a.account_class='receivable'
                        then l.debit_cents - l.credit_cents
                        else l.credit_cents - l.debit_cents end)::bigint as amt
        from clara.journal_lines l
        join clara.coa_accounts a
          on a.client_id = l.client_id and a.account_code = l.account_code
        where l.entry_id = p_entry and a.account_class in ('payable','receivable')
        group by 1, 2
      )
      select n.dom, n.cp, 'opening'::text, n.amt,
        (select oi.id from clara.opening_items oi
          where oi.entry_id = p_entry
            and oi.item_kind = case when n.dom='ar' then 'ar_open_item' else 'ap_open_item' end
            and clara._canonical_counterparty(e.client_id, oi.counterparty_id) = n.cp),
        null::uuid
      from nets n where n.amt <> 0
      order by 1, 2;
    return;
  end if;

  -- LADDER 3, 4 and 5 share ONE control-net query; only the label differs. That is not a
  -- shortcut: it is the reason a settlement item is exactly -gross without a special case.
  -- The composite's entry credits (AR) or debits (AP) the control for amount+discount, so
  -- the signed control net IS -gross by construction, and nothing in this function has to
  -- know what a discount is.
  -- LADDER 3T (#655) — THE WORK-LANE TRADE INVOICE. It sits BELOW ladders 1 (reversal) and 2
  -- (opening), so a reversal mirror and an opening entry are untouched by construction. It fires
  -- ONLY when clara._trade_invoice_kind_of_entry finds a trade invoice for this entry, so EVERY
  -- other input in the estate classifies byte-identically.
  --
  -- ITS RANK, STATED AS THE CODE ACTUALLY EXPRESSES IT (ADV-655-7). Structurally 3T is tested
  -- BEFORE `e.coding_kind` is read at all, so it sits above ALL the coding_kind ladders, not only
  -- above LADDER 5's `coding_kind is null => 'adjustment'` default. TODAY the two readings cannot
  -- diverge, because no entry in the estate carries BOTH a coding_kind and a trade invoice: this
  -- lane pins `coding_kind IS NULL` (cell p655.rig.coding_kind_untouched) and the coding lane
  -- writes no clara.trade_invoices row. #665's cutover is what produces the entry that carries
  -- both, and at that moment THIS resolver — not the column — decides the kind. That is a
  -- decision #665 must make explicitly; it is recorded here rather than inherited from a comment,
  -- and it is deliberately NOT narrowed to `e.coding_kind is null` in this file, because doing so
  -- would deepen a widening of this shared classifier that is itself still awaiting the
  -- orchestrator's ratification (report's "scope deviation", review finding F1).
  --
  -- WHY IT HAD TO EXIST AT ALL. MEASURED on clara_655 (PG 17.11) before 0225 was written: a
  -- documentless coding_kind-NULL entry with a payable control leg classifies 'adjustment' here,
  -- while the Work lane's open item is a 'bill' — and clara._tf_subledger_entry_belt ARM 1
  -- compares the two and raises CLR10 subledger_entry_untied (v_bad = 1, measured). The estate's
  -- law is that THIS function is the ONE classifier and the subledger must be derivable from the
  -- ledger; a second lane minting bill/invoice items without teaching the classifier about itself
  -- is not a new lane, it is a broken invariant. Setting journal_entries.coding_kind instead was
  -- rejected on measurement: it arms clara._assert_supplier_bill_shape_at_projected, whose
  -- sst_purchase_cost arm requires a DOCUMENT-STATED tax total, which a chat- or UI-stated bill
  -- has not got.
  v_ti_kind := clara._trade_invoice_kind_of_entry(p_entry);
  if v_ti_kind = 'sales_invoice' then
    v_kind := 'invoice';                                         -- LADDER 3T
  elsif v_ti_kind = 'supplier_bill' then
    v_kind := 'bill';                                            -- LADDER 3T
  elsif e.coding_kind is null then
    v_kind := 'adjustment';                                      -- LADDER 5 (WCA-R2)
  elsif e.coding_kind = 'supplier_bill' then
    v_kind := 'bill';                                            -- LADDER 3
  elsif e.coding_kind = 'sales_invoice' then
    v_kind := 'invoice';                                         -- LADDER 3
  elsif e.coding_kind = 'sales_credit_note' then
    v_kind := 'credit_note';                                     -- LADDER 3
  elsif e.coding_kind in ('customer_receipt','supplier_payment') then
    v_kind := 'settlement';                                      -- LADDER 4
  else
    return;                                                      -- LADDER 6: no rows
  end if;

  -- ZERO NET PER COUNTERPARTY YIELDS NO ITEM. An intra-domain same-party reclass is a real
  -- GL event with no subledger effect, and the identity is per DOMAIN, never per account, so
  -- the tie is unaffected.
  return query
    with nets as (
      select case a.account_class when 'receivable' then 'ar' else 'ap' end as dom,
             clara._canonical_counterparty(e.client_id, l.counterparty_id) as cp,
             sum(case when a.account_class='receivable'
                      then l.debit_cents - l.credit_cents
                      else l.credit_cents - l.debit_cents end)::bigint as amt
      from clara.journal_lines l
      join clara.coa_accounts a
        on a.client_id = l.client_id and a.account_code = l.account_code
      where l.entry_id = p_entry and a.account_class in ('payable','receivable')
      group by 1, 2
    )
    select n.dom, n.cp, v_kind, n.amt, null::uuid, null::uuid
    from nets n where n.amt <> 0
    order by 1, 2;
end $function$;


-- =====================================================================================
-- C.3 · clara._tf_subledger_item_belt — the bill/invoice arms learn the second lawful source.
-- Every other arm (reversal_unwind, opening, credit_note, settlement, adjustment, the classifier
-- congruence aggregate, the two-sided bound) is carried byte-identically.
-- =====================================================================================

CREATE OR REPLACE FUNCTION clara._tf_subledger_item_belt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare i record; e record; v_out bigint; v_sign int; v_kind text;
        v_sum bigint; v_gkind text; v_kinds int; v_cp uuid;
begin
  -- RE-QUERY BY ID (0009:524-529).
  select * into i from clara.open_items oi where oi.id = new.id;
  if not found then return null; end if;
  select * into e from clara.journal_entries je where je.id = i.entry_id;
  if not found then
    raise exception 'open item % has no entry' , i.id
      using errcode='CLR10',detail='{"reason":"subledger_item_orphan"}';
  end if;

  -- (c) TENANT AND LIFECYCLE CONGRUENCE beyond the FKs. The triple-key FK already binds
  -- firm and client; what it cannot say is that the entry must be APPROVED. Only approved is
  -- in the books, and an opening entry can be WITHDRAWN after its draft-time opening_items
  -- row exists, so this is a live corner rather than a hypothetical.
  if e.status <> 'approved' then
    raise exception 'open item % hangs off a non-approved entry', i.id
      using errcode='CLR10',detail='{"reason":"subledger_item_not_approved"}';
  end if;

  -- (c) KIND TO SOURCE. item_kind is not a label the writer chooses -- it is a statement
  -- about the entry, and this is where that statement is made checkable.
  if i.item_kind = 'reversal_unwind' then
    if e.reversal_of is null then v_kind := 'reversal_unwind'; end if;
  elsif i.item_kind = 'opening' then
    if not e.is_opening_balance or e.reversal_of is not null then v_kind := 'opening'; end if;
  elsif i.item_kind = 'bill' then
    -- #655 · A SECOND LAWFUL SOURCE OF THE SAME KIND. This arm hard-coded item_kind='bill' <=>
    -- coding_kind='supplier_bill' and consulted the classifier not at all, so a Work-lane trade
    -- invoice — whose entry deliberately carries coding_kind NULL (see 0225's MEASUREMENT 2) —
    -- met CLR10 subledger_item_kind_mismatch at commit. The lane is named through the ONE shared
    -- resolver clara._subledger_classify_entry LADDER 3T uses, so the two can never disagree.
    if e.coding_kind is distinct from 'supplier_bill'
       and clara._trade_invoice_kind_of_entry(i.entry_id) is distinct from 'supplier_bill' then
      v_kind := 'bill';
    end if;
  elsif i.item_kind = 'invoice' then
    if e.coding_kind is distinct from 'sales_invoice'
       and clara._trade_invoice_kind_of_entry(i.entry_id) is distinct from 'sales_invoice' then
      v_kind := 'invoice';
    end if;
  elsif i.item_kind = 'credit_note' then
    if e.coding_kind is distinct from 'sales_credit_note' then v_kind := 'credit_note'; end if;
  elsif i.item_kind = 'settlement' then
    if e.coding_kind is distinct from (case when i.domain='ar' then 'customer_receipt'
                                            else 'supplier_payment' end) then
      v_kind := 'settlement';
    end if;
  elsif i.item_kind = 'adjustment' then
    if e.coding_kind is not null or e.is_opening_balance or e.reversal_of is not null then
      v_kind := 'adjustment';
    end if;
  end if;
  if v_kind is not null then
    raise exception 'open item % claims kind % but its entry does not support it', i.id, v_kind
      using errcode='CLR10',detail='{"reason":"subledger_item_kind_mismatch"}';
  end if;

  -- (c) CLASSIFIER CONGRUENCE, ASSERTED ON THE GROUP AGGREGATE -- the exact complement of
  -- belt-1's arm 1. Belt-1 fires only on a journal_entries write, so a LONE
  -- `insert into clara.open_items` against an entry that was approved in some EARLIER
  -- transaction touches no journal_entries row and dodges it completely: a second item for
  -- the same party would sail past every FK and past belt-1, and it would break the section-3
  -- identity on the spot.
  --
  -- WHY THE AGGREGATE AND NOT THE ROW. The grain unique is keyed on the STORED counterparty
  -- id, and merges never repoint history -- so once A has merged into B, an entry already
  -- carrying an item that names A can accept a SECOND item naming B at a different grain key.
  -- Row-wise that duplicate is indistinguishable from the real thing (the classifier's one
  -- row for the canonical group has exactly its amount and its kind, so a per-row test says
  -- yes), while the group it lands in now sums to twice what the ledger says. Only equality
  -- on the (entry, domain, CANONICAL counterparty) SUM can see it -- which is also the grain
  -- belt-1 and the tail assert on, so all three now speak one law. The kind census is carried
  -- across for the same reason: a group must be one kind, exactly as the classifier emits it.
  v_cp := clara._canonical_counterparty(i.client_id, i.counterparty_id);
  select sum(oi.amount_cents)::bigint, min(oi.item_kind), count(distinct oi.item_kind)::int
    into v_sum, v_gkind, v_kinds
    from clara.open_items oi
    where oi.entry_id = i.entry_id and oi.domain = i.domain
      and clara._canonical_counterparty(oi.client_id, oi.counterparty_id) = v_cp;
  if v_kinds is distinct from 1 or not exists (
    select 1 from clara._subledger_classify_entry(i.entry_id) cl
    where cl.domain = i.domain
      and cl.counterparty_id = v_cp
      and cl.amount_cents = v_sum
      and cl.item_kind = v_gkind) then
    raise exception 'open item % leaves its (entry, domain, counterparty) group at % / kind %, which is not what the classifier produces for entry % -- the subledger would no longer be derivable from the ledger', i.id, v_sum, coalesce(v_gkind,'(mixed)'), i.entry_id
      using errcode='CLR10',detail='{"reason":"subledger_item_not_classified"}';
  end if;

  -- (a) THE TWO-SIDED, SIGN-AWARE BOUND. sign(amount) * outstanding must stay within
  -- [0, abs(amount)]: no over-allocation past zero AND no inflation past face value. The
  -- second half is the one v1 lacked, and it is what stops a credit item being "settled"
  -- into a larger claim than the document ever supported.
  v_out := clara._subledger_outstanding(i.id);
  v_sign := case when i.amount_cents > 0 then 1 else -1 end;
  if v_sign * v_out < 0 or v_sign * v_out > abs(i.amount_cents) then
    raise exception 'open item % is allocated outside its two-sided bound (amount %, outstanding %)',
      i.id, i.amount_cents, v_out
      using errcode='CLR10',detail='{"reason":"subledger_bound_violated"}';
  end if;
  return null;
end $function$;

-- =====================================================================================
-- SECTION D  THE OPEN-ITEM BIRTH. A lane-agnostic deferred constraint trigger — 0216's instrument
-- (0216:293-353), declared exactly as 0216:350-353 declares its own and for 0216's stated reason:
-- an entry may be born approved on a lane that does not draft first, so the `when` clause is
-- byte-identical to the belt's and the two triggers are queued for exactly the same events.
--
-- WHAT IT SOLVES. The Work lane never calls `clara._subledger_on_approve` — its core INSERTs a
-- draft and flips status with a bare UPDATE (0204:651-654) — so no open item is ever materialised
-- there. 0216:30-38 measured that gap for #639; this is the instrument that closes it for the
-- subledger without making the core the hook's SEVENTH caller. Section F re-derives the caller
-- census at its measured SIX and asserts this function does not name the hook (0216:948-952's
-- own mirror).
--
-- IT DOES NOT CALL `clara._subledger_classify_entry` EITHER, and that is deliberate: the
-- classifier answers "what items SHOULD this entry have", which is what the BELT asks; this
-- trigger answers "mint them", and it reads its kind from the TYPED OBJECT rather than from a
-- column this lane leaves NULL. The two agree because section C.2 taught the classifier the same
-- lane through the same shared resolver — not because one calls the other.
--
-- THE NAME IS THE MECHANISM (measurement 3): `t_je_open_item_birth` sorts before
-- `t_je_subledger_belt`, the ONE deferred trigger on `clara.journal_entries` that reads
-- `clara.open_items` at commit, so the item exists by the time the belt counts it. Deferred
-- constraint-trigger events for one row are queued in trigger-name order and fire at commit in
-- queue order — measured on clara_655, PG 17.11, and asserted by `p655.rig.trigger_order`.
--
-- AN ENTRY FROM EVERY OTHER LANE LEAVES ON THE FIRST READ. That is the whole cost this instrument
-- adds to #651's depreciation runs, to the coding lane and to every opening entry: one indexed
-- lookup on `ix_trade_invoice_status_entry`.
-- =====================================================================================
create function clara._tf_je_open_item_birth() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_inv record; v_actor uuid; v_item uuid; r record;
  v_cp_kind text; v_dom text; v_kind text;
begin
  -- SUBJECT RESOLUTION, path (1) of 0225's MEASUREMENT 3: the `posted` status row, appended by
  -- clara._tf_trade_invoice_posted — a NON-deferred AFTER INSERT row trigger on
  -- clara.operation_receipts that has already fired inside the posting statement by the time this
  -- deferred queue runs.
  select ti.* into v_inv
    from clara.trade_invoice_status st
    join clara.trade_invoices ti on ti.id = st.invoice_id
   where st.state = 'posted' and st.entry_id = new.id;
  if v_inv.id is null then
    -- PATH (2), THE STATED FALLBACK. A TEXT comparison so ix_operation_receipts_entry
    -- (0178:454-455) is usable — never a uuid cast of the jsonb expression. Kept because the
    -- status ledger is "the INDEXED handle and the audit trail, not the only source of truth"
    -- (0221:1417-1421): removing the stamp trigger must degrade this to one more index scan, not
    -- to silence.
    select ti.* into v_inv
      from clara.operation_receipts o
      join clara.trade_invoices ti on ti.work_id = o.work_id
     where o.effects->>'entry_id' = new.id::text and o.outcome = 'committed';
  end if;
  -- WHAT EVERY ENTRY FROM EVERY OTHER LANE DOES.
  if v_inv.id is null then return null; end if;

  v_actor := coalesce(new.checker_actor, new.maker_actor);
  v_dom  := case v_inv.kind when 'sales_invoice' then 'ar' else 'ap' end;
  v_kind := case v_inv.kind when 'sales_invoice' then 'invoice' else 'bill' end;

  -- THE SIGNED CONTROL NET PER CANONICAL COUNTERPARTY — the `nets` CTE of
  -- clara._subledger_classify_entry (0037:1012-1026), copied including
  -- clara._canonical_counterparty, because the item must be derivable from the LEDGER and a
  -- second arithmetic here would be a second answer. Zero nets yield no item, exactly as every
  -- classifier ladder drops them (amount_cents <> 0 is a CHECK).
  for r in
    with nets as (
      select case a.account_class when 'receivable' then 'ar' else 'ap' end as dom,
             clara._canonical_counterparty(new.client_id, l.counterparty_id) as cp,
             sum(case when a.account_class = 'receivable'
                      then l.debit_cents - l.credit_cents
                      else l.credit_cents - l.debit_cents end)::bigint as amt
        from clara.journal_lines l
        join clara.coa_accounts a
          on a.client_id = l.client_id and a.account_code = l.account_code
       where l.entry_id = new.id and a.account_class in ('payable','receivable')
       group by 1, 2
    )
    select n.dom, n.cp, n.amt from nets n where n.amt <> 0 order by 1, 2
  loop
    -- THE COUNTERPARTY-KIND ↔ DOMAIN RULE (0037:1088-1096), restated here rather than inherited,
    -- because this trigger is not inside the hook. clara._tf_open_items_validate asks it again on
    -- the row; asking it here makes the diagnosis name the entry and the party.
    select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = r.cp;
    if (r.dom = 'ar' and v_cp_kind is distinct from 'customer')
       or (r.dom = 'ap' and v_cp_kind is distinct from 'vendor') then
      raise exception 'the counterparty kind contradicts the control domain on trade invoice %', v_inv.id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','counterparty_kind_mismatch','domain',r.dom,
            'counterparty_id',r.cp,'counterparty_kind',v_cp_kind,'invoice_id',v_inv.id)::text;
    end if;
    if r.dom <> v_dom then
      raise exception 'a % moved the % control balance', v_inv.kind, r.dom
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_control_domain','kind',v_inv.kind,
            'domain',r.dom,'invoice_id',v_inv.id)::text;
    end if;
    -- TYPED, NEVER A BARE 23514 out of ck_open_items_kind_matrix (invoice ⇒ ar && >0,
    -- bill ⇒ ap && >0). The door already proved the control net equals a positive stated total;
    -- this is the belt behind it, and it wears the door's own token.
    if r.amt <= 0 then
      raise exception 'a % nets % sen on its control account; an invoice is a positive claim',
        v_inv.kind, r.amt
        using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_total','kind',v_inv.kind,
            'control_net_cents',r.amt,'invoice_id',v_inv.id)::text;
    end if;

    v_item := null;
    insert into clara.open_items(firm_id, client_id, domain, counterparty_id, entry_id,
        item_kind, opening_item_id, reversal_unwind_of, item_date, due_date, amount_cents,
        created_in_migration, created_by)
      values (new.firm_id, new.client_id, r.dom, r.cp, new.id,
        v_kind, null, null, new.posting_date, v_inv.due_date, r.amt, false, v_actor)
      on conflict on constraint uq_open_items_grain do nothing
      returning id into v_item;
    if v_item is not null then
      -- THE SAME PAYLOAD THE HOOK APPENDS (0037:1111-1118), so a reader of the event stream
      -- cannot tell which instrument birthed the row — which is the point of a lane-agnostic
      -- birth.
      perform clara._append_event(new.firm_id, 'open_item.created', new.client_id, v_actor,
        null, null, new.id, new.document_id, null,
        jsonb_build_object('item_id', v_item, 'domain', r.dom, 'counterparty_id', r.cp,
          'item_kind', v_kind, 'amount_cents', r.amt));
    end if;
  end loop;
  return null;
end $$;
revoke all on function clara._tf_je_open_item_birth() from public;
comment on function clara._tf_je_open_item_birth() is
  '#655: the LANE-AGNOSTIC open-item birth. A deferred constraint trigger on '
  'clara.journal_entries, named to fire before t_je_subledger_belt (deferred triggers fire in '
  'trigger-name order -- measured on clara_655, PG 17.11: t_je_subledger_belt is the ONE deferred '
  'trigger on this table that reads clara.open_items at commit). It resolves its subject through '
  'clara.trade_invoice_status (posted, entry_id), falls back to the committed operation receipt, '
  'and returns immediately for every entry no trade invoice names. It does NOT call '
  'clara._subledger_on_approve and does NOT call clara._subledger_classify_entry.';

create constraint trigger t_je_open_item_birth
  after insert or update on clara.journal_entries
  deferrable initially deferred for each row when (new.status = 'approved')
  execute function clara._tf_je_open_item_birth();

-- =====================================================================================
-- SECTION E  THE READ. Viewer-floored, firm-scoped, ONE jsonb value — the
-- `clara.get_work_claim_origin` precedent (0221:1889-1893), which is what lets the Work list and
-- the Work detail say "Supplier bill · Alpha Supplies · AP" WITHOUT a purpose value (C08.5).
--
-- THE ENTRY, THE RECEIPT, THE OPEN ITEM AND ITS OUTSTANDING ARE ALL DERIVED. Nothing here is a
-- stored back-pointer, which is exactly why clara.trade_invoices could stay append-only with zero
-- admitted updates.
-- =====================================================================================
create function clara.get_trade_invoice(p_work uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_out jsonb;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  select jsonb_build_object(
      'invoice_id', ti.id,
      'work_id', ti.work_id,
      'kind', ti.kind,
      'domain', case ti.kind when 'sales_invoice' then 'ar' else 'ap' end,
      'counterparty_id', ti.counterparty_id,
      'counterparty_name', cp.name,
      'counterparty_kind', cp.kind,
      'counterparty_registration_no', cp.registration_no,
      'document_date', to_char(ti.document_date,'YYYY-MM-DD'),
      'due_date', to_char(ti.due_date,'YYYY-MM-DD'),
      'due_date_source', ti.due_date_source,
      'reference', ti.reference,
      'currency', ti.currency,
      'total_cents', ti.total_cents,
      'tax_facts', ti.tax_facts,
      'source_document_id', ti.source_document_id,
      'recorded_by', ti.recorded_by,
      'created_at', ti.created_at,
      'state', coalesce(st.state, 'admitted'),
      'entry_id', st.entry_id,
      'receipt_id', st.receipt_id,
      'open_item_id', oi.id,
      'open_item_amount_cents', oi.amount_cents,
      'open_item_due_date', to_char(oi.due_date,'YYYY-MM-DD'),
      'outstanding_cents', case when oi.id is null then null
                                else clara._subledger_outstanding(oi.id) end)
    into v_out
    from clara.trade_invoices ti
    join clara.counterparties cp on cp.id = ti.counterparty_id
    left join clara.trade_invoice_status st
      on st.invoice_id = ti.id and st.state = 'posted'
    left join clara.open_items oi on oi.entry_id = st.entry_id
     and oi.domain = case ti.kind when 'sales_invoice' then 'ar' else 'ap' end
   where ti.work_id = p_work and ti.firm_id = v_firm;
  return v_out;
end $$;
revoke all on function clara.get_trade_invoice(uuid) from public;
grant execute on function clara.get_trade_invoice(uuid) to clara_authenticated;
grant execute on function clara.get_trade_invoice(uuid) to clara_runtime;
comment on function clara.get_trade_invoice(uuid) is
  '#655: ONE trade invoice by the Work it rides, with its party identity, its due-date basis and '
  'its DERIVED entry / receipt / open item / outstanding. Viewer+, firm-scoped. This is what lets '
  'a Work row read "Supplier bill · Alpha Supplies · AP" without a purpose value.';

reset role;

-- =====================================================================================
-- SECTION F  TAIL CENSUS. Every claim this file made, re-READ from the committed catalog — and,
-- first, every claim it made about what it did NOT touch.
-- =====================================================================================
do $w655_tail$
declare v_n int; v_src text; v_def text; v_names text[]; v_tok text;
begin
  -- (T.1) THE PURPOSE VOCABULARY DID NOT MOVE. Both CHECK texts byte-identical to their 0194 form:
  -- a trade invoice rides `journal_entry` and widens nothing.
  foreach v_def in array array['accounting_work_purpose_check','operation_receipts_purpose_check'] loop
    if pg_get_constraintdef((select oid from pg_constraint
          where conrelid = (case when v_def like 'accounting_work%' then 'clara.accounting_work'::regclass
                                 else 'clara.operation_receipts'::regclass end)
            and conname = v_def))
       <> 'CHECK ((purpose = ANY (ARRAY[''journal_entry''::text, ''periodic_stock_adjustment''::text, ''payroll_obligation''::text])))' then
      raise exception '#655 tail: % MOVED -- a trade invoice rides journal_entry and widens nothing', v_def;
    end if;
  end loop;

  -- (T.2) THE FIVE NON-REGRESSION BODIES, RE-READ AFTER THIS FILE RAN, at the shas section 0
  -- MEASURED. These are the bodies 0225 edits NONE of.
  for v_def, v_src in
    select * from (values
      ('clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)',
       '10b89677d342a424d5959ded8ad2c8c974c4ff9bdc26f5c0dd6c773a15af2612'),
      ('clara._subledger_on_approve(uuid)',
       '6e37c601ff716e0c73b3061bcb503cc01539f2f237841650657fa2d9600accfd'),
      ('clara._validate_entry_lines(uuid,jsonb)',
       '37b03159a535770d6d7053aa826270703fcafa86f3864e9e344fe5bb886d3c71'),
      ('clara._approve_entry_core(jsonb,uuid,uuid,text,text)',
       'd5ab4afc85f79c2676e047ae1f2a5c622cac81f9877a502ae521531b11a3c637'),
      ('clara._tf_subledger_entry_belt()',
       'a648d6f57768db8342f5d184650b17801008bf02ff4caee0d2daafa316afad49')
    ) as t(sig, sha)
  loop
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = v_def::regprocedure) <> v_src then
      raise exception '#655 tail: % MOVED -- 0225 recuts exactly three bodies and this is not one of them', v_def;
    end if;
  end loop;

  -- (T.3) THE THREE RECUT BODIES ACTUALLY MOVED, and each kept its owner, its SECURITY DEFINER,
  -- its search_path and its ACL byte for byte. A recut that silently dropped `security definer` or
  -- gained a grant would be an authority hole with a green test suite.
  for v_def, v_src in
    select * from (values
      ('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)',
       'bc24524656e1a47812d12c4db24afde565e2aad3bb60f25d18234c05860838b3'),
      ('clara._subledger_classify_entry(uuid)',
       '9443605db09329fe6998d4d3bdfe5125f64bd5ff52d998b921d688d7c9daa0f1'),
      ('clara._tf_subledger_item_belt()',
       'ba7fe9c16dcc30bb9c99aa3c17809b2bd51ef1b9554fd0f04811edb0d467eba6')
    ) as t(sig, sha)
  loop
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = v_def::regprocedure) = v_src then
      raise exception '#655 tail: % is still at its PRE-IMAGE sha -- the recut did not take', v_def;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = v_def::regprocedure) then
      raise exception '#655 tail: % lost SECURITY DEFINER in the recut', v_def;
    end if;
    if (select pg_get_userbyid(p.proowner) from pg_proc p where p.oid = v_def::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '#655 tail: % changed owner in the recut', v_def;
    end if;
    if (select p.proconfig from pg_proc p where p.oid = v_def::regprocedure)
       is distinct from array['search_path=clara, pg_temp'] then
      raise exception '#655 tail: % lost its pinned search_path in the recut', v_def;
    end if;
    if (select p.proacl::text from pg_proc p where p.oid = v_def::regprocedure)
       <> '{clara_fn_owner=X/clara_fn_owner}' then
      raise exception '#655 tail: % gained an ACL entry in the recut (%)', v_def,
        (select p.proacl::text from pg_proc p where p.oid = v_def::regprocedure);
    end if;
  end loop;

  -- (T.4) ALL SEVENTEEN REFUSAL TOKENS OF THE POSTING CORE, PRESENT BY NAME IN THE SIXTH COPY.
  -- The blast radius of a ~610-line recut is a LOST ARM, which is a silent authority hole; this is
  -- what makes that impossible to miss. 0204:776-782's list, verbatim.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  foreach v_tok in array array['egress_not_authorized','work_cancelled','work_settled',
      'obo_not_initiator','basis_mismatch','generic_control_leg','source_conflict',
      'periodic_adjustments','adjustment_basis','operation_payload_conflict','unknown_account',
      'client_inactive','logical_op_mismatch','obo_not_active','insufficient_role',
      'work_not_found','wake_task_unbound'] loop
    if position(v_tok in v_src) = 0 then
      raise exception '#655 tail: the sixth copy of the posting core LOST the refusal token % -- an arm went missing in the recut', v_tok;
    end if;
  end loop;
  -- …plus the four non-token pins 0204:786-791 carries.
  foreach v_tok in array array['_work_egress_event_seq','consent','activation'] loop
    if position(v_tok in v_src) = 0 then
      raise exception '#655 tail: the sixth copy of the posting core LOST %', v_tok;
    end if;
  end loop;
  -- THE PURPOSE FILTER, VERBATIM. 0194:2180's own position() probe runs against this exact string
  -- on the from-scratch chain, so a reformatting here breaks a census two migrations away.
  if position('aw.purpose in (''journal_entry'',''periodic_stock_adjustment'',''payroll_obligation'')'
              in v_src) = 0 then
    raise exception '#655 tail: the sixth copy of the posting core no longer carries 0204:178-181''s purpose filter VERBATIM';
  end if;
  -- AND THE NEW ARM IS NARROW: the refusal is conditional on the trade-invoice lookup and on
  -- nothing else.
  if position('if v_bad_code is not null and v_ti_id is null then' in v_src) = 0 then
    raise exception '#655 tail: the generic_control_leg refusal is not gated on the trade-invoice lookup';
  end if;
  -- AND IT WRITES NO BACK-POINTER (0221:350-355's rule).
  if v_src ~ 'update\s+clara\.trade_invoices' then
    raise exception '#655 tail: the posting core UPDATEs clara.trade_invoices -- the entry and the receipt are derivable by join, never stored there';
  end if;

  -- (T.5) THE `generic_control_leg` ARM IS STILL REACHABLE for a Work with no trade-invoice row.
  -- A recut that opened a hole rather than a door would still pass T.4 (the token is present); this
  -- asks whether the arm can still FIRE. The probe is structural: the raise sits inside a branch
  -- whose only escape is `v_ti_id is not null`.
  if position('detail=jsonb_build_object(''reason'',''generic_control_leg'',' in v_src) = 0 then
    raise exception '#655 tail: the generic_control_leg raise is gone from the sixth copy';
  end if;

  -- (T.6) THE SUBLEDGER-HOOK CALLER CENSUS — UNCHANGED at the MEASURED SIX (0216:938-947,
  -- superseding 0037:3841-3847's stale four). #655 adds NO caller, and the birth trigger does not
  -- name the hook (0216:948-952's own mirror). THIS CLOSES #868's COPY IN THIS FILE.
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='clara' and position('clara._subledger_on_approve(' in p.prosrc) > 0
     and p.proname <> '_subledger_on_approve';
  if v_names is distinct from array['_approve_entry_core','_approve_opening_entry',
                                    'approve_wrong_client_correction','finalize_close',
                                    'reopen_fiscal_year','reverse_entry'] then
    raise exception '#655 tail: the subledger hook caller set is % -- 0225 re-pinned the measured six', v_names;
  end if;
  if position('clara._subledger_on_approve(' in
       (select p.prosrc from pg_proc p where p.oid='clara._tf_je_open_item_birth()'::regprocedure)) <> 0 then
    raise exception '#655 tail: the birth trigger calls the subledger hook -- it must birth directly';
  end if;
  if position('clara._subledger_classify_entry(' in
       (select p.prosrc from pg_proc p where p.oid='clara._tf_je_open_item_birth()'::regprocedure)) <> 0 then
    raise exception '#655 tail: the birth trigger calls the classifier -- it reads its kind from the TYPED OBJECT (0037:995-996 would return adjustment)';
  end if;

  -- (T.7) THE `clara.open_items` WRITER CENSUS IS NOW **TWO**, superseding 0037:3830-3833's ONE.
  -- Re-derived from the catalog, never transcribed. #868's second stale copy, closed here.
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='clara' and position('insert into clara.open_items(' in p.prosrc) > 0;
  if v_names is distinct from array['_subledger_on_approve','_tf_je_open_item_birth'] then
    raise exception '#655 tail: the clara.open_items writer set is % -- 0225 makes it exactly the two named here', v_names;
  end if;

  -- (T.8) THE APPROVE-PATH CENSUS. 0037:3774-3782 pinned FOUR before the Work lane existed;
  -- `clara._record_journal_entry_core` approves in the same call (0204:651-654) and is a genuine
  -- approve path. Re-derived and re-asserted here at its live membership so a reader is never left
  -- believing 0037's four. #868's third stale copy, closed here.
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='clara'
     and p.prosrc ~ 'set\s+status\s*=\s*''approved'''
     and p.proname not like '\_tf\_%';
  if not (v_names @> array['_record_journal_entry_core']) then
    raise exception '#655 tail: the approve-path census % no longer includes the Work-lane core', v_names;
  end if;

  -- (T.9) THE BIRTH TRIGGER, ITS DECLARATION AND ITS ORDER. Both are DEFERRABLE INITIALLY
  -- DEFERRED, both fire on INSERT OR UPDATE `when (new.status = 'approved')`, and the birth sorts
  -- BEFORE the belt — which is the physics MEASUREMENT 3 measured rather than argued.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.journal_entries'::regclass and tgname = 't_je_open_item_birth'
     and tgdeferrable and tginitdeferred and tgconstraint <> 0;
  if v_n <> 1 then
    raise exception '#655 tail: t_je_open_item_birth is absent or not a DEFERRABLE INITIALLY DEFERRED constraint trigger';
  end if;
  if not ('t_je_open_item_birth' < 't_je_subledger_belt') then
    raise exception '#655 tail: t_je_open_item_birth no longer sorts before t_je_subledger_belt';
  end if;
  select count(*)::int into v_n from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'clara.journal_entries'::regclass and not t.tgisinternal
     and t.tgdeferrable and t.tginitdeferred
     and position('open_items' in p.prosrc) > 0
     and t.tgname < 't_je_open_item_birth';
  if v_n <> 0 then
    raise exception '#655 tail: % deferred trigger(s) that touch clara.open_items now sort BEFORE the birth -- re-measure the firing order', v_n;
  end if;

  -- (T.10) THE GRANTS. The ONE admission door is clara_runtime and NOTHING else — and
  -- clara_authenticated HOLDING it is asserted as a FAILURE (0221:1880-1888's pair). There is no
  -- `_for` twin and no clara_authenticated door.
  if not has_function_privilege('clara_runtime',
       'clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)', 'EXECUTE') then
    raise exception '#655 tail: clara_runtime does not hold clara.admit_trade_invoice_work';
  end if;
  if has_function_privilege('clara_authenticated',
       'clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)', 'EXECUTE') then
    raise exception '#655 tail: clara_authenticated HOLDS clara.admit_trade_invoice_work -- Work admission on this lane is a runtime act OBO a named human (0221:1202-1206)';
  end if;
  for v_def in select unnest(array['clara.admit_trade_invoice_work_for','clara.admit_trade_invoice']) loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='clara' and ('clara.'||p.proname) = v_def) then
      raise exception '#655 tail: % exists -- this lane has exactly ONE admission door', v_def;
    end if;
  end loop;
  if not has_function_privilege('clara_authenticated','clara.get_trade_invoice(uuid)','EXECUTE') then
    raise exception '#655 tail: clara_authenticated cannot read clara.get_trade_invoice';
  end if;
  -- THE INTERNALS, UNGRANTED TO EVERY APPLICATION ROLE.
  foreach v_def in array array['clara._assert_trade_invoice_basis(uuid,text,jsonb,jsonb,boolean)',
      'clara._trade_invoice_resolve_party(uuid,text,jsonb)',
      'clara._trade_invoice_canonical(text,jsonb,jsonb)',
      'clara._trade_invoice_due(jsonb,jsonb,integer)',
      'clara._trade_invoice_kind_of_entry(uuid)',
      'clara._tf_je_open_item_birth()','clara._tf_trade_invoice_posted()',
      'clara._tf_trade_invoice_append_only()'] loop
    if has_function_privilege('clara_authenticated', v_def, 'EXECUTE')
       or has_function_privilege('clara_runtime', v_def, 'EXECUTE')
       or has_function_privilege('clara_agent_ro', v_def, 'EXECUTE') then
      raise exception '#655 tail: the internal % is granted to an application role', v_def;
    end if;
  end loop;
  -- NO `p_attestation` ANYWHERE ON THIS LANE, and the high-stakes ceremony is unreachable from it
  -- (CB-AE2E-013). Removing p_attestation from clara.approve_entry (0009:1523) is a DIFFERENT
  -- lane's retirement and is explicitly not #655's.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='clara' and p.proname='admit_trade_invoice_work'
                and 'p_attestation' = any(p.proargnames)) then
    raise exception '#655 tail: the admission door carries a p_attestation argument';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)'::regprocedure;
  if position('is_high_stakes' in v_src) <> 0 or position('approve_entry' in v_src) <> 0 then
    raise exception '#655 tail: the admission door reaches the high-stakes approval ceremony';
  end if;

  -- (T.11) THE TWO NEW RELATIONS: FORCE RLS on, ZERO DML grants to any application role, and every
  -- citation tenant-carrying.
  foreach v_def in array array['clara.trade_invoices','clara.trade_invoice_status'] loop
    select count(*)::int into v_n from pg_class c
     where c.oid = v_def::regclass and c.relrowsecurity and c.relforcerowsecurity;
    if v_n <> 1 then
      raise exception '#655 tail: % is not FORCE ROW LEVEL SECURITY', v_def;
    end if;
    foreach v_tok in array array['clara_authenticated','clara_runtime','clara_agent_ro'] loop
      if has_table_privilege(v_tok, v_def, 'INSERT')
         or has_table_privilege(v_tok, v_def, 'UPDATE')
         or has_table_privilege(v_tok, v_def, 'DELETE') then
        raise exception '#655 tail: % holds DML on %', v_tok, v_def;
      end if;
    end loop;
  end loop;
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.trade_invoices'::regclass and contype = 'f' and cardinality(conkey) >= 2;
  if v_n < 4 then
    raise exception '#655 tail: clara.trade_invoices carries only % tenant-carrying composite FK(s)', v_n;
  end if;

  -- (T.12) THE WHOLE-ESTATE PROBE: no trade_invoices row names an entry whose control leg
  -- contradicts its kind. Vacuously true on a fresh chain; it is the assertion a later data repair
  -- would trip over, which is the point of putting it in the migration rather than in a test.
  select count(*)::int into v_n
    from clara.trade_invoices ti
    join clara.trade_invoice_status st on st.invoice_id = ti.id and st.state = 'posted'
    join clara.journal_lines l on l.entry_id = st.entry_id
    join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
   where a.account_class in ('payable','receivable')
     and a.account_class <> case ti.kind when 'sales_invoice' then 'receivable' else 'payable' end;
  if v_n <> 0 then
    raise exception '#655 tail: % posted trade-invoice control leg(s) contradict their kind', v_n;
  end if;

  -- (T.13) THE ESTATE'S OWN INVARIANT, ASKED OF THE NEW LANE: every open item this lane could
  -- have birthed is exactly what clara._subledger_classify_entry says it should be. Vacuously true
  -- on a fresh chain and the thing that catches a LADDER 3T that drifted from the birth trigger.
  select count(*)::int into v_n from (
    select oi.entry_id, oi.domain, clara._canonical_counterparty(oi.client_id, oi.counterparty_id) cp,
           sum(oi.amount_cents)::bigint amt, min(oi.item_kind) k
      from clara.open_items oi
      join clara.trade_invoice_status st on st.entry_id = oi.entry_id and st.state='posted'
     group by 1,2,3 having sum(oi.amount_cents) <> 0) it
   where not exists (
     select 1 from clara._subledger_classify_entry(it.entry_id) cl
      where cl.domain = it.domain and cl.counterparty_id is not distinct from it.cp
        and cl.amount_cents = it.amt and cl.item_kind = it.k);
  if v_n <> 0 then
    raise exception '#655 tail: % trade-invoice open-item group(s) are not what the classifier produces -- LADDER 3T and the birth trigger have parted company', v_n;
  end if;

  raise notice '#655 tail OK (1/6): both purpose CHECK texts are byte-identical to 0194 and the five non-regression bodies are unchanged -- 0225 widens no vocabulary';
  raise notice '#655 tail OK (2/6): the three recut bodies moved and each kept owner, SECURITY DEFINER, search_path and ACL; all seventeen posting-core refusal tokens and the purpose filter survive verbatim';
  raise notice '#655 tail OK (3/6): the subledger-hook caller census is the measured SIX (unchanged), the open_items writer census is now TWO (was 0037:3830-3833''s ONE), and the approve-path census names the Work-lane core -- #868''s three stale copies closed in this file';
  raise notice '#655 tail OK (4/6): t_je_open_item_birth is a deferred constraint trigger sorting before t_je_subledger_belt, and no deferred open_items reader sorts before it';
  raise notice '#655 tail OK (5/6): the ONE door is clara_runtime-only with no clara_authenticated twin and no p_attestation, the read is clara_authenticated+clara_runtime, and all eight internals are ungranted';
  raise notice '#655 tail OK (6/6): both new relations are FORCE-RLS with zero application-role DML and tenant-carrying citations; the whole-estate control-leg and classifier-congruence probes are clean';
end
$w655_tail$;
