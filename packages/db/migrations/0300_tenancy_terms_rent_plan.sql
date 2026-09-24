-- 0300_tenancy_terms_rent_plan -- #949 (riders wave 4, lane 01): 租约条款记录，以及由人确认后才开始
-- 运行的经常性租金计划 · A TENANCY'S CONTRACT-TERMS RECORD, AND THE RECURRING RENT PLAN A PERSON
-- CONFIRMS.
-- =====================================================================================
-- Spec of record: issue #949's Agent Brief (the body) TOGETHER WITH the OWNER'S RULING comment
-- dated 2026-09-20 on the same ticket (work order rule 2: the newest brief plus any owner ruling
-- of that date win). Parent #926 (owner ruling 2026-09-18, question 7: "the tenancy half drafts a
-- rent plan a person confirms"). Blocked by #948 (0299_agreement_contract_acquisition.sql, same
-- lane, already applied on this database): it creates the agreement questionnaire, the `contract`
-- field-path namespace and the evaluator whose `tenancy` classification this file reads.
--
-- =====================================================================================
-- THE OWNER'S RULING OF 2026-09-20, AND WHERE EACH HALF OF IT LANDS.
--
-- (1) THE CREDIT ACCOUNT is a NEW dedicated standard-chart liability row, `2050 Rent Payable`,
--     not `2010 Other Payables` and not `2020 Accruals`. It landed in the ONE shared chart
--     migration 0295 (#941/#942/#946/#949) and this file CONSUMES it by code and name -- it
--     inserts no chart row anywhere (WAVE-4 LANE RULE (a)). The accountant may still choose
--     another liability account when confirming the plan, which is why
--     clara.confirm_tenancy_rent_plan takes the payable code as an ARGUMENT with 2050 as the
--     draft's own proposal rather than as a hardcoded law.
--
-- (2) WHEN THE SIMPLE MONTHLY-RENT TREATMENT MAY NOT COMPLY, CLARA STOPS AND ASKS. The lessee
--     accounting branch, verbatim from the ruling and checked against the standard before it was
--     written into a body (AGENTS.md rule 6):
--       MPERS Section 20 -- a lessee expenses operating-lease payments on a STRAIGHT-LINE basis
--       over the lease term, so a monthly rent expense is right for an MPERS client with LEVEL
--       rent.
--       MFRS 16 -- a lessee recognises a RIGHT-OF-USE ASSET and a LEASE LIABILITY for a lease
--       over 12 months (then depreciation and interest, not rent expense); only a SHORT-TERM
--       lease (12 months or less) or a LOW-VALUE asset may be expensed straight-line.
--       STEPPED RENT -- straight-line means the total rent AVERAGED over the term, so with a
--       stated escalation the monthly expense differs from the month's cash rent unless the
--       increases only follow expected general inflation.
--     So `clara._tenancy_lease_treatment` DRAFTS only in the ordinary case (framework MPERS, or
--     MFRS with a term of 12 months or less, AND level rent) and otherwise ASKS: it states the
--     term, the rent and the escalation it read, names what the standard asks, and the
--     accountant decides. Full MFRS 16 measurement (discount rate, right-of-use asset, lease
--     liability schedule) is OUT OF SCOPE here and is a later ticket; this file measures nothing
--     it cannot read.
--
--     "ASKS" IS A PROMPT, NEVER A WALL (the standing owner ruling "beta, nothing dark"). The
--     confirm door still admits the plan when the branch asks -- but ONLY against a written
--     PROFESSIONAL JUDGEMENT the accountant types, which is recorded on the confirmation row and
--     printed into the plan's own purpose. Clara never auto-posts a treatment that may not
--     comply; a person may, having been told exactly what the standard asks.
--
-- =====================================================================================
-- THE TRIAGE QUESTION THE OWNER LEFT TO THE IMPLEMENTER, MEASURED RATHER THAN ASSUMED:
-- "whether AC1's contract-terms record is redundant with clara.client_facts; reuse it if it
-- fits."  IT DOES NOT FIT, for three measured reasons (all read off this lane's database):
--
--   (a) `uq_client_fact_live` is UNIQUE on (client_id, fact_key) WHERE superseded_at is null --
--       ONE live row per client and key. A client with TWO tenancies (two shoplots) could not
--       carry two live monthly rents. This record is per client AND AGREEMENT by construction.
--   (b) `clara.client_fact_keys` is a CLOSED five-member registry (banking_arrangement,
--       customer_identity_policy, entity_type, msic, trade_nature) behind a FOREIGN KEY, and
--       0192/#644 carried that estate's successor role to clara.knowledge_records. Adding a rent
--       key to it would re-open a lane the estate deliberately narrowed.
--   (c) It carries `source_document_id` but NO region pointer, and AC1 asks for each term to
--       carry "the region of the agreement it was read from". A document id cannot say WHERE on
--       the page a figure was printed.
--
-- The knowledge lane (clara.knowledge_records) was checked too and is the same shape problem:
-- its subject is the CLIENT or the FIRM, never one agreement, and its keys are a closed catalog.
-- So this file mints `clara.contract_terms` -- per client and agreement, append-only,
-- supersede-only, carrying the regions -- and nothing else in the estate gains a second copy of
-- a tenancy's terms.
--
-- WHY THE TERMS ARE NOT SIMPLY MORE QUESTIONS ON #948's QUESTIONNAIRE. `agreementFacts_v1` is a
-- FROZEN closure (five frozen files, #948 §D.1's registered evaluator). A frozen body is never
-- recut in place (work order rule 5), so an ESCALATION -- which the eleven-question roster has no
-- question for -- cannot be read by that family at all. What this file does instead is honest
-- about which terms come from where: the rent, the deposit and the term's length ARE read (they
-- are #948's `instalment_amount`, `deposit`, `agreement_date` and `term_months`, each with the
-- region the lane banked), the term's first and last DAY are DERIVED from two of those regions
-- (and a person corrects them where the page states a different commencement), and the
-- escalation is PERSON-STATED with its own basis. Every row says which of the three it is
-- (`basis_kind`), so nothing on a screen can pass a derivation off as a reading.
--
-- =====================================================================================
-- THE SHAPE THIS FILE REUSES, NEVER RE-INVENTS (WAVE-4 LANE RULE (c)). CONTEXT.md's "Settlement
-- candidate row" -- #657's pending bank line (the first instance), #947's unsettled payroll net
-- pay (the second, migration 0298). THIS file is the third and it reuses 0298's own bodies as
-- its template, line for line: a per-client FIFO ledger read over ONE liability account, a
-- deterministic candidate read (exact amount, date window, live/unspent/unexcepted lines only,
-- never a score), an accept door that books the settlement and then reuses
-- `clara._match_bank_line_core` VERBATIM, and a queue arm DERIVED from the ledger read so the row
-- clears itself by any route with no dismissal act anywhere.
--
-- WHY THE PLAN NEVER CREDITS A BANK ACCOUNT, in the brief's own words: "a plan that pays itself
-- out of the bank account double-counts the moment the real payment arrives on the statement and
-- is coded, once as the plan's own credit and once as the bank line's." So the drafted basis
-- credits the rent payable and the confirm door REFUSES a bank credit BY NAME
-- (`plan_credits_bank_account`), measured against two independent facts this database already
-- holds: `clara.coa_accounts.is_bank_account` and the client's own registered
-- `clara.bank_accounts.coa_account_code`.
--
-- WHAT THIS FILE DOES NOT DO. It does not touch #939's prepayment lane: a tenancy paid a year up
-- front is a PREPAYMENT and its service period stays person-stated (AC7 is proven by a cell over
-- the untouched door, not by a line of code here). It writes no chart row. It recuts no frozen
-- body. It mints no second matching mechanism. And it computes no MFRS 16 measurement.
-- =====================================================================================

-- =====================================================================================
-- §A  PRESTATE. Every claim this file makes about what it builds on, MEASURED on the lane
--     database (127.0.0.1:55741 / clara_l01) after #948 and pinned here.
-- =====================================================================================
do $p949_prestate$
declare
  v_sha text; v_n int; v_def text;
begin
  -- THE WRITER OF THE REGIONS THIS FILE CITES. clara.contract_terms.source_region_ids names
  -- clara.document_regions rows that #948's persist door wrote, one per run-level question, hung
  -- off the canonical `agreement_text_facts` extraction. If that body's region-writing loop ever
  -- moves, the terms this file proposes move with it -- pinned so a recut collides here rather
  -- than silently proposing a term from a region that is no longer there.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.persist_agreement_facts(uuid,jsonb,jsonb,integer)'::regprocedure;
  if v_sha <> 'd3b22a8ae6cd6ef47e3e1765fd52b95f3b0f8a27cc0d2a255dcdd1c0be47d1de' then
    raise exception '#949 prestate: clara.persist_agreement_facts has DRIFTED from its pinned #948 body (sha %) -- the regions this file cites may have moved; re-derive clara.propose_contract_terms against the live body before applying', v_sha using errcode='CLR10';
  end if;

  -- #948's DRAFTING BODY, pinned because this file's whole existence rests on what it REFUSES:
  -- a tenancy drafts NOTHING through the fixed-asset lane (`not_a_financing_agreement`). If that
  -- early return ever moved, a tenancy could reach the acquisition lane AND this one at once.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._agreement_entry_plan(uuid,jsonb)'::regprocedure;
  if v_sha <> '1db0f2be1a1e9ce75e407f867da9498d593dfb92d76d68f2960fa6cb6680b9ca' then
    raise exception '#949 prestate: clara._agreement_entry_plan has DRIFTED from its pinned #948 body (sha %) -- re-derive whether a tenancy still drafts nothing through the fixed-asset lane before applying', v_sha using errcode='CLR10';
  end if;

  -- THE EVALUATOR whose `agreement_class='tenancy'` verdict and whose `facts` map this file
  -- reads. It is a REGISTERED FROZEN closure (#948 §D.1), so a drift here is a lane defect, not
  -- a refactor.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)'::regprocedure;
  if v_sha <> '0c99e23bfd5d69aa733f0c180a42e4eb4b9bd3b7f856a0332dbbb8bfe5057c1c' then
    raise exception '#949 prestate: clara.evaluate_agreement_contract_state_v1 has DRIFTED from its REGISTERED frozen body (sha %) -- a frozen evaluator is never recut in place', v_sha using errcode='CLR10';
  end if;

  -- NON-SHA CLAIM 1: the three chart rows this lane consumes are live on the CURRENT published
  -- platform template, by CODE AND NAME (WAVE-4 LANE RULE (a)). 2050 Rent Payable is #949's own
  -- ruling, minted by 0295; 6100 Rental of Premises and 1120 Deposits Paid have shipped since
  -- 0150. This file APPENDS NONE of them -- it reads them.
  for v_def, v_n in
    select x.code, 1 from (values ('2050','Rent Payable'),('6100','Rental of Premises'),
                                  ('1120','Deposits Paid')) x(code, nm)
     where not exists (
       select 1 from clara.coa_template_accounts a
         join clara.coa_templates t on t.id = a.template_id
        where t.template_key = 'my_sme_starter' and t.scope = 'platform' and t.state = 'published'
          and t.version = (select max(t2.version) from clara.coa_templates t2
                             where t2.template_key='my_sme_starter' and t2.scope='platform'
                               and t2.state='published')
          and a.account_code = x.code and a.name = x.nm)
  loop
    raise exception '#949 prestate: the CURRENT published platform template does not carry account % under the name this file consumes it by', v_def using errcode='CLR10';
  end loop;

  -- NON-SHA CLAIM 2: the shared no-truncate trigger function this file hangs on its new relation.
  if to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception '#949 prestate: clara._tf_no_truncate() is absent -- the append-only belt this file installs has no TRUNCATE arm to hang on' using errcode='CLR10';
  end if;

  -- NON-SHA CLAIM 3: the knowledge key whose value carries the client's reporting framework. The
  -- ruling's branch reads it; the key has existed since 0192/#644 and carries
  -- {framework_code, framework_label, ...} verbatim as the interview folds it. Its own label
  -- says "DESCRIPTIVE in this slice -- no posting or presentation code reads this row"; THIS
  -- FILE IS THE FIRST READER, and it reads it to ASK a question, never to post one.
  if not exists (select 1 from clara.knowledge_keys k where k.knowledge_key = 'reporting_framework') then
    raise exception '#949 prestate: clara.knowledge_keys carries no reporting_framework key -- the MPERS/MFRS branch has nothing to read' using errcode='CLR10';
  end if;

  raise notice '#949 prestate: OK -- clara.persist_agreement_facts, clara._agreement_entry_plan and the registered clara.evaluate_agreement_contract_state_v1 are at their pinned #948 bodies; 2050 Rent Payable, 6100 Rental of Premises and 1120 Deposits Paid are live on the current published platform template under the names this file consumes them by; clara._tf_no_truncate() exists; and the reporting_framework knowledge key is registered.';
end
$p949_prestate$;

set role clara_fn_owner;

-- =====================================================================================
-- §B  clara.contract_terms -- THE CONTRACT-TERMS RECORD (AC1).
--
--     ONE LIVE ROW PER (AGREEMENT DOCUMENT, TERM KEY), append-only and supersede-only: a
--     correction opens a SUCCESSOR and the superseded row is never edited. The closed term
--     vocabulary is the brief's own list -- the monthly rent, the deposit, any escalation the
--     agreement states, and the term's first and last day.
--
--     `basis_kind` IS THE HONESTY COLUMN. `document_region` means a region of THIS agreement
--     printed this value and the region ids are in the row; `derived_from_regions` means the
--     value was computed from regions of this agreement by a rule the basis sentence states (the
--     term's last day from the first day and the printed term in months); `person_stated` means
--     a named human typed it, with their own basis, and no region is claimed. The CHECK ties the
--     two halves together so a row cannot claim a region basis while carrying no region, nor
--     carry regions while calling itself person-stated.
--
--     RLS MATCHES THE DOCUMENTS ESTATE, policy for policy (clara.document_regions, 0007:788):
--     forced RLS, the owner's ALL policy, a firm-scoped SELECT for clara_authenticated and a
--     firm-scoped SELECT for clara_agent_ro. The runtime role gets NOTHING: a contract term is
--     written by a human door and read by human and agent surfaces; no worker needs it, and the
--     narrowest grant that works is the one this file takes.
-- =====================================================================================
-- REDO-SAFE (#957): `if not exists` rather than a bare `create table`, the packages/db/README.md
-- rule for a redo target. A from-scratch chain creates it here; a redo over this file's own
-- prior effects finds it and moves on, and every index, policy and trigger below is written the
-- same way.
create table if not exists clara.contract_terms (
  id                 uuid        primary key default gen_random_uuid(),
  firm_id            uuid        not null references clara.firms(id),
  client_id          uuid        not null,
  -- The agreement this term was read from. A term never exists without one: "a contract-terms
  -- record per client AND AGREEMENT" is the brief's own scope, and it is what makes two
  -- tenancies for one client two separate records rather than one that overwrites the other.
  document_id        uuid        not null references clara.documents(id),
  term_key           text        not null check (term_key in
                       ('monthly_rent','deposit','escalation','term_start','term_end')),
  amount_cents       bigint,
  term_date          date,
  -- {effective_from: date, new_amount_cents: int > 0, printed_raw?: text}. Shape is the door's;
  -- the CHECK here only refuses a non-object, the clara.accounting_plans.authority_ref idiom.
  escalation         jsonb       check (escalation is null or jsonb_typeof(escalation) = 'object'),
  -- The rendering the page carried, where a page carried one. NEVER re-derived from the figure:
  -- "3,600.00" and "RM3,600" are different renderings of one amount and a person may need to see
  -- which one the agreement actually prints.
  printed_raw        text,
  source_extraction_id uuid      references clara.document_extractions(id),
  source_region_ids  uuid[]      not null default '{}',
  basis_kind         text        not null check (basis_kind in
                       ('document_region','derived_from_regions','person_stated')),
  basis              text        not null check (btrim(basis) <> ''),
  recorded_by        uuid        not null references clara.users(id),
  recorded_at        timestamptz not null default now(),
  superseded_by      uuid        references clara.contract_terms(id) deferrable initially deferred,
  superseded_at      timestamptz,
  supersede_reason   text,
  constraint fk_contract_terms_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint ck_contract_terms_supersession_paired check (
    (superseded_by is null) = (superseded_at is null)),
  -- A region basis carries regions; a person-stated one carries none. Both directions, so the
  -- column cannot be decorative.
  constraint ck_contract_terms_region_basis check (
    (basis_kind = 'person_stated') = (cardinality(source_region_ids) = 0)),
  -- EACH TERM KEY CARRIES EXACTLY ITS OWN VALUE COLUMN AND NO OTHER. A monthly rent that also
  -- carried a date, or an escalation that also carried cents, would be two readings in one row
  -- and every consumer would have to guess which one to believe.
  constraint ck_contract_terms_value check (
    case term_key
      when 'monthly_rent' then amount_cents is not null and amount_cents > 0
                            and term_date is null and escalation is null
      when 'deposit'      then amount_cents is not null and amount_cents >= 0
                            and term_date is null and escalation is null
      when 'term_start'   then term_date is not null and amount_cents is null and escalation is null
      when 'term_end'     then term_date is not null and amount_cents is null and escalation is null
      when 'escalation'   then escalation is not null and amount_cents is null and term_date is null
      else false
    end)
);

comment on table clara.contract_terms is
  '#949 AC1: one live row per (agreement document, term key) -- the monthly rent, the deposit, '
  'any escalation the agreement states, and the term''s first and last day, each carrying the '
  'clara.document_regions row(s) of THAT agreement it was read or derived from. Append-only and '
  'supersede-only: a correction opens a successor and the superseded row is never edited '
  '(clara._tf_contract_terms_append_only). Written ONLY by clara.record_contract_terms; read '
  'through clara.get_contract_terms and, under firm-scoped RLS, directly by human and agent '
  'surfaces. basis_kind says whether a value was READ from a region, DERIVED from regions by the '
  'rule its basis sentence states, or STATED by a named person.';

-- ONE LIVE TERM PER AGREEMENT AND KEY -- the supersede chain's own law, at the storage layer.
create unique index if not exists uq_contract_terms_live on clara.contract_terms(document_id, term_key)
  where superseded_at is null;
create index if not exists ix_contract_terms_document on clara.contract_terms(document_id, term_key, recorded_at desc);
create index if not exists ix_contract_terms_client on clara.contract_terms(client_id, recorded_at desc);

alter table clara.contract_terms enable row level security;
alter table clara.contract_terms force row level security;
drop policy if exists p_contract_terms_owner on clara.contract_terms;
create policy p_contract_terms_owner on clara.contract_terms for all to clara_fn_owner
  using (true) with check (true);
drop policy if exists p_contract_terms_human on clara.contract_terms;
create policy p_contract_terms_human on clara.contract_terms for select to clara_authenticated
  using (firm_id = clara.jwt_firm());
drop policy if exists p_contract_terms_agent on clara.contract_terms;
create policy p_contract_terms_agent on clara.contract_terms for select to clara_agent_ro
  using (firm_id = clara.wake_firm());
grant select on clara.contract_terms to clara_authenticated, clara_agent_ro;

-- THE APPEND-ONLY BELT, clara._tf_accrual_adjustment_append_only's shape (0222): DELETE never,
-- and exactly ONE admitted UPDATE -- stamping the supersession, once, null -> not null. Every
-- other column is compared column by column so a future writer cannot quietly widen this by
-- adding a SET.
create or replace function clara._tf_contract_terms_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $tfctao$
begin
  if tg_op = 'DELETE' then
    raise exception 'a contract term is never deleted (supersede it, do not erase it)'
      using errcode='CLR08',
        detail='{"reason":"contract_term_immutable","column":"*"}';
  end if;
  if old.superseded_by is not null or new.superseded_by is null then
    raise exception 'a contract term admits exactly one update: stamping its supersession, once'
      using errcode='CLR08', detail='{"reason":"contract_term_immutable"}';
  end if;
  if row(new.id,new.firm_id,new.client_id,new.document_id,new.term_key,new.amount_cents,
         new.term_date,new.escalation,new.printed_raw,new.source_extraction_id,
         new.source_region_ids,new.basis_kind,new.basis,new.recorded_by,new.recorded_at)
     is distinct from
     row(old.id,old.firm_id,old.client_id,old.document_id,old.term_key,old.amount_cents,
         old.term_date,old.escalation,old.printed_raw,old.source_extraction_id,
         old.source_region_ids,old.basis_kind,old.basis,old.recorded_by,old.recorded_at) then
    raise exception 'a contract term is immutable; record a changed term as a successor'
      using errcode='CLR08', detail='{"reason":"contract_term_immutable"}';
  end if;
  return new;
end $tfctao$;

comment on function clara._tf_contract_terms_append_only() is
  '#949: clara.contract_terms is append-only. DELETE is refused outright; the ONE admitted UPDATE stamps superseded_by/superseded_at/supersede_reason exactly once, and every other column is compared column by column so a widened SET collides here.';

drop trigger if exists t_contract_terms_append_only on clara.contract_terms;
create trigger t_contract_terms_append_only
  before delete or update on clara.contract_terms
  for each row execute function clara._tf_contract_terms_append_only();
drop trigger if exists t_contract_terms_no_truncate on clara.contract_terms;
create trigger t_contract_terms_no_truncate
  before truncate on clara.contract_terms
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §C  THE TWO DOORS OVER THE RECORD (AC1).
--
--     clara.record_contract_terms(p_client, p_document, p_terms, p_op_key) -- bookkeeper+, the
--     ONE writer. `p_terms` is an ARRAY of {term_key, amount_cents?, term_date?, escalation?,
--     printed_raw?, source_region_ids?, basis_kind, basis, supersede_reason?} and the whole array
--     lands in ONE transaction: a term set that is half-recorded is a term set nobody can read.
--
--     A CITED REGION MUST BELONG TO THIS AGREEMENT. The region ids are validated against
--     clara.document_regions joined to clara.document_extractions of THIS document -- otherwise a
--     term could cite a region of some other client's page and the whole "click the figure and
--     see where it came from" promise would be a lie a reader cannot check.
--
--     clara.get_contract_terms(p_document) -- viewer+, the read every surface renders: the live
--     terms in the vocabulary's own order, the superseded ones beside them, and the agreement's
--     own class so a page can say what kind of contract it is reading.
-- =====================================================================================
create or replace function clara._contract_terms_row_json(r clara.contract_terms) returns jsonb
  language sql stable set search_path = clara, pg_temp as $ctrj$
  select jsonb_build_object(
    'id', r.id, 'term_key', r.term_key,
    'amount_cents', r.amount_cents, 'term_date', to_char(r.term_date,'YYYY-MM-DD'),
    'escalation', r.escalation, 'printed_raw', r.printed_raw,
    'source_extraction_id', r.source_extraction_id,
    'source_region_ids', to_jsonb(r.source_region_ids),
    'basis_kind', r.basis_kind, 'basis', r.basis,
    'recorded_by', r.recorded_by, 'recorded_at', r.recorded_at,
    'superseded_by', r.superseded_by, 'superseded_at', r.superseded_at,
    'supersede_reason', r.supersede_reason);
$ctrj$;
revoke all on function clara._contract_terms_row_json(clara.contract_terms) from public;

comment on function clara._contract_terms_row_json(clara.contract_terms) is
  '#949: the ONE json projection of a clara.contract_terms row, so the live read and the history read cannot drift apart. Ungranted.';

-- The vocabulary's own reading order, used by both doors so a page never has to sort.
create or replace function clara._contract_term_rank(p_key text) returns int
  language sql immutable set search_path = clara, pg_temp as $ctr$
  select case p_key when 'monthly_rent' then 1 when 'deposit' then 2 when 'term_start' then 3
                    when 'term_end' then 4 when 'escalation' then 5 else 9 end;
$ctr$;
revoke all on function clara._contract_term_rank(text) from public;

create or replace function clara.record_contract_terms(p_client uuid, p_document uuid,
    p_terms jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $rct$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_filing uuid; v_kind text;
  v_extraction uuid; e record; t jsonb;
  v_key text; v_basis_kind text; v_basis text; v_regions uuid[]; v_n int;
  v_amount bigint; v_date date; v_esc jsonb; v_raw text; v_reason text;
  v_new uuid; v_recorded jsonb := '[]'::jsonb; v_superseded int := 0; v_old uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'recording contract terms requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if jsonb_typeof(p_terms) <> 'array' or jsonb_array_length(p_terms) = 0 then
    raise exception 'contract terms are recorded as a non-empty array of terms'
      using errcode='CLR10', detail='{"reason":"contract_terms_shape","constraint":"nonempty_array"}';
  end if;

  -- THE DOCUMENT MUST BE THIS CLIENT'S OWN FILED AGREEMENT. Same refusal for absent and foreign
  -- alike (the 0021 rule -- no existence oracle).
  select f.id into v_filing from clara.document_filings f
   where f.document_id = p_document and f.client_id = p_client and f.firm_id = c.firm
     and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_filing is null then
    raise exception 'document % is not a live filing of this client', p_document using errcode='CLR11';
  end if;
  select d.document_kind into v_kind from clara.documents d where d.id = p_document;
  if v_kind is distinct from 'agreement_contract' then
    raise exception 'contract terms are recorded against an agreement contract, not a %', coalesce(v_kind,'(unclassified)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','contract_terms_wrong_kind','kind',v_kind)::text;
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'record_contract_terms', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'document', p_document, 'terms', p_terms)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- The newest banked agreement reading, if there is one: every region a term may cite hangs off
  -- an extraction of this document, and this is the one a term is stamped with.
  select x.id into v_extraction from clara.document_extractions x
   where x.document_id = p_document and x.engine_kind = 'agreement_text_facts' and x.status = 'done'
   order by x.version_n desc, x.extracted_at desc limit 1;

  for t in select value from jsonb_array_elements(p_terms) loop
    v_key := nullif(btrim(coalesce(t->>'term_key','')),'');
    if v_key is null or clara._contract_term_rank(v_key) = 9 then
      raise exception 'contract term key % is not one this record carries (monthly_rent, deposit, term_start, term_end, escalation)', coalesce(v_key,'(null)')
        using errcode='CLR10',
          detail=jsonb_build_object('reason','contract_term_key_unknown','term_key',v_key)::text;
    end if;
    v_basis := nullif(btrim(coalesce(t->>'basis','')),'');
    if v_basis is null then
      raise exception 'contract term % carries no basis -- every reading says where it came from', v_key
        using errcode='CLR10',
          detail=jsonb_build_object('reason','contract_term_basis_missing','term_key',v_key)::text;
    end if;
    v_basis_kind := nullif(btrim(coalesce(t->>'basis_kind','')),'');
    if v_basis_kind is null or v_basis_kind not in ('document_region','derived_from_regions','person_stated') then
      raise exception 'contract term % carries an unknown basis kind %', v_key, coalesce(v_basis_kind,'(null)')
        using errcode='CLR10',
          detail=jsonb_build_object('reason','contract_term_basis_kind_unknown','term_key',v_key,
            'basis_kind',v_basis_kind)::text;
    end if;

    v_regions := coalesce((select array_agg((x)::uuid)
      from jsonb_array_elements_text(case when jsonb_typeof(t->'source_region_ids') = 'array'
                                          then t->'source_region_ids' else '[]'::jsonb end) x),
      '{}'::uuid[]);
    if v_basis_kind = 'person_stated' and cardinality(v_regions) > 0 then
      raise exception 'contract term % calls itself person-stated yet cites % region(s)', v_key, cardinality(v_regions)
        using errcode='CLR10',
          detail=jsonb_build_object('reason','contract_term_region_unexpected','term_key',v_key)::text;
    end if;
    if v_basis_kind <> 'person_stated' and cardinality(v_regions) = 0 then
      raise exception 'contract term % claims a % basis but cites no region', v_key, v_basis_kind
        using errcode='CLR10',
          detail=jsonb_build_object('reason','contract_term_region_missing','term_key',v_key,
            'basis_kind',v_basis_kind)::text;
    end if;
    if cardinality(v_regions) > 0 then
      select count(*)::int into v_n from clara.document_regions r
        join clara.document_extractions x on x.id = r.extraction_id
       where r.id = any(v_regions) and x.document_id = p_document and r.firm_id = c.firm;
      if v_n <> cardinality(v_regions) then
        raise exception 'contract term % cites % region(s) this agreement does not carry', v_key, cardinality(v_regions) - v_n
          using errcode='CLR10',
            detail=jsonb_build_object('reason','contract_term_region_foreign','term_key',v_key,
              'cited', cardinality(v_regions), 'resolved', v_n)::text;
      end if;
    end if;

    v_amount := nullif(btrim(coalesce(t->>'amount_cents','')),'')::bigint;
    v_date := nullif(btrim(coalesce(t->>'term_date','')),'')::date;
    v_esc := case when jsonb_typeof(t->'escalation') = 'object' then t->'escalation' end;
    v_raw := nullif(btrim(coalesce(t->>'printed_raw','')),'');
    v_reason := nullif(btrim(coalesce(t->>'supersede_reason','')),'');

    -- AN ESCALATION'S OWN SHAPE, validated at the door (the column CHECK can only see that it is
    -- an object): a date it takes effect from and the amount it moves the rent to. Nothing is
    -- computed from a percentage here -- a percentage of what, over which months, is exactly the
    -- straight-line question the owner's ruling sends to a person.
    if v_key = 'escalation' then
      if v_esc is null then
        raise exception 'an escalation term carries the escalation object itself'
          using errcode='CLR10',
            detail='{"reason":"contract_term_escalation_shape","constraint":"object"}';
      end if;
      begin
        perform (v_esc->>'effective_from')::date;
      exception when others then
        raise exception 'an escalation states the date it takes effect (got %)', coalesce(v_esc->>'effective_from','(null)')
          using errcode='CLR10',
            detail='{"reason":"contract_term_escalation_shape","constraint":"effective_from"}';
      end;
      if coalesce(nullif(btrim(coalesce(v_esc->>'new_amount_cents','')),'')::bigint, 0) <= 0 then
        raise exception 'an escalation states the monthly amount it moves the rent to'
          using errcode='CLR10',
            detail='{"reason":"contract_term_escalation_shape","constraint":"new_amount_cents"}';
      end if;
    end if;

    -- SUPERSEDE, NEVER EDIT -- AND IN THAT ORDER. `uq_contract_terms_live` is a partial UNIQUE
    -- over (document_id, term_key) where superseded_at is null, and it is NOT deferrable, so the
    -- predecessor must leave the live set BEFORE the successor enters it. The successor's id is
    -- minted here and the back-pointer is written against it first; `superseded_by`'s foreign key
    -- is DEFERRABLE INITIALLY DEFERRED precisely so that pointer may name a row this transaction
    -- has not inserted yet. (Measured: the other order fails 23505 on the live index.)
    select ct.id into v_old from clara.contract_terms ct
     where ct.document_id = p_document and ct.term_key = v_key and ct.superseded_at is null;

    v_new := gen_random_uuid();
    if v_old is not null then
      update clara.contract_terms
         set superseded_by = v_new, superseded_at = now(),
             supersede_reason = coalesce(v_reason, 'superseded by a later reading')
       where id = v_old;
      v_superseded := v_superseded + 1;
    end if;

    insert into clara.contract_terms(id, firm_id, client_id, document_id, term_key, amount_cents,
        term_date, escalation, printed_raw, source_extraction_id, source_region_ids,
        basis_kind, basis, recorded_by)
      values (v_new, c.firm, p_client, p_document, v_key, v_amount, v_date, v_esc, v_raw,
        case when cardinality(v_regions) > 0 then v_extraction end, v_regions,
        v_basis_kind, v_basis, c.actor);

    v_recorded := v_recorded || jsonb_build_array(
      jsonb_build_object('id', v_new, 'term_key', v_key, 'supersedes', v_old));
  end loop;

  perform clara._audit(c.firm, c.actor, null, null, 'record_contract_terms', null,
    jsonb_build_object('client', p_client, 'document', p_document,
      'recorded', jsonb_array_length(v_recorded), 'superseded', v_superseded));

  return clara._finish_op(c.firm, 'record_contract_terms', p_op_key,
    jsonb_build_object('document_id', p_document, 'client_id', p_client,
      'recorded', jsonb_array_length(v_recorded), 'superseded', v_superseded,
      'terms', v_recorded));
end $rct$;

comment on function clara.record_contract_terms(uuid,uuid,jsonb,text) is
  '#949 AC1: the ONE writer of clara.contract_terms. Records a whole term set against one filed agreement contract in ONE transaction, superseding any live row of the same key rather than editing it, and refusing a cited region that does not belong to this agreement. bookkeeper+, clara_authenticated only.';

revoke all on function clara.record_contract_terms(uuid,uuid,jsonb,text) from public;
grant execute on function clara.record_contract_terms(uuid,uuid,jsonb,text) to clara_authenticated;

create or replace function clara.get_contract_terms(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $gct$
declare c record; v_client uuid; v_state jsonb; v_live jsonb; v_hist jsonb;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select f.client_id into v_client from clara.document_filings f
   where f.document_id = p_document and f.firm_id = c.firm and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_client is null then
    raise exception 'document % is not a live filing in your firm', p_document using errcode='CLR11';
  end if;

  select e.envelope->'contract_state' into v_state from clara.document_extractions e
   where e.document_id = p_document and e.engine_kind = 'agreement_text_facts' and e.status = 'done'
   order by e.version_n desc, e.extracted_at desc limit 1;

  select coalesce(jsonb_agg(clara._contract_terms_row_json(ct)
           order by clara._contract_term_rank(ct.term_key)), '[]'::jsonb)
    into v_live
    from clara.contract_terms ct
   where ct.document_id = p_document and ct.superseded_at is null;

  select coalesce(jsonb_agg(clara._contract_terms_row_json(ct)
           order by ct.superseded_at desc), '[]'::jsonb)
    into v_hist
    from clara.contract_terms ct
   where ct.document_id = p_document and ct.superseded_at is not null;

  return jsonb_build_object('document_id', p_document, 'client_id', v_client,
    'agreement_class', v_state->>'agreement_class',
    'terms', v_live, 'history', v_hist);
end $gct$;

comment on function clara.get_contract_terms(uuid) is
  '#949 AC1: the live contract terms of one agreement, in the vocabulary''s own order, with the superseded readings beside them and the agreement''s own class. Derived entirely from live state. viewer+, clara_authenticated only.';

revoke all on function clara.get_contract_terms(uuid) from public;
grant execute on function clara.get_contract_terms(uuid) to clara_authenticated;

reset role;
