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
  'through clara.get_contract_terms and, under firm-scoped RLS, directly by the human surface (the '
  'agent lane holds no grant on this table: it has doors). basis_kind says whether a value was '
  'READ from a region, DERIVED from regions by the '
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
-- NO AGENT-LANE GRANT (fix round, finding SPEC-08). A first cut copied clara.document_regions'
-- posture, which carries a firm-scoped clara_agent_ro SELECT -- and that breached the estate's
-- own wall: rig-runtime-visibility.test.mjs's "the agent lane has ZERO access to every new table"
-- sweep admits an agent table grant ONLY where the lane has no door to route the read through
-- (0192 §H's knowledge_records is the type case), and every exception on that list is positively
-- verified. This lane has doors: clara.get_contract_terms and clara.get_tenancy_rent_plan_draft.
-- The standing owner ruling is that access control is never loosened, so the grant and its
-- policy go; the DROP is unconditional so a redo of an earlier cut of this file removes them.
drop policy if exists p_contract_terms_agent on clara.contract_terms;
grant select on clara.contract_terms to clara_authenticated;
revoke all on clara.contract_terms from clara_agent_ro;

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

revoke all on function clara._tf_contract_terms_append_only() from public;

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

set role clara_fn_owner;

-- =====================================================================================
-- §D  clara.propose_contract_terms(p_document) -- WHAT CLARA CAN ALREADY READ (AC1).
--
--     The terms #948's landed lane ALREADY banked, each carrying the clara.document_regions row
--     it was read from, plus -- said out loud -- the terms it could not read and why. This is a
--     pure read: it writes nothing, and a person turns it into a record through
--     clara.record_contract_terms.
--
--     THE FOUR READABLE TERMS AND THEIR ONE DERIVATION.
--       monthly_rent  <- contract.agreement.instalment_amount   (a READING)
--       deposit       <- contract.agreement.deposit             (a READING)
--       term_start    <- contract.agreement.agreement_date      (a DERIVATION: the day the
--                        agreement was signed. A tenancy whose premises are handed over on a
--                        LATER date states that date in its own words and a person corrects the
--                        term, which is exactly why the row says `derived_from_regions` and
--                        carries a basis sentence naming the rule.)
--       term_end      <- term_start + term_months - 1 day       (a DERIVATION from TWO regions;
--                        the last day is INCLUSIVE, so a 24-month term from 5 January 2026 ends
--                        on 4 January 2028.)
--
--     AND THE ONE IT CANNOT READ AT ALL: the escalation. `agreementFacts_v1` is FROZEN at eleven
--     run-level questions and none of them asks about a rent review, so the honest answer is
--     `no_question_in_the_questionnaire` -- never silence, and never a zero.
--
--     ONLY A TENANCY. The evaluator classifies the page itself (#948 SecD's closed roster); a
--     hire purchase, a finance lease or a supply contract proposes NOTHING and says
--     `not_a_tenancy`. `operating_lease` is deliberately NOT admitted here: a lessee's operating
--     lease of premises would take the same treatment, but this lane has never seen a real page
--     of that class and admitting one on the strength of a word in a title would be the lane
--     guessing. A later ticket widens the roster with a page in front of it.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
create or replace function clara._tenancy_term_regions(p_document uuid)
  returns table(field_path text, region_id uuid, extraction_id uuid)
  language sql stable set search_path = clara, pg_temp as $ttr$
  select r.field_path, r.id, r.extraction_id
    from clara.document_regions r
    join clara.document_extractions e on e.id = r.extraction_id
   where e.document_id = p_document and e.engine_kind = 'agreement_text_facts' and e.status = 'done'
     and e.version_n = (select max(e2.version_n) from clara.document_extractions e2
                         where e2.document_id = p_document
                           and e2.engine_kind = 'agreement_text_facts' and e2.status = 'done');
$ttr$;
revoke all on function clara._tenancy_term_regions(uuid) from public;

comment on function clara._tenancy_term_regions(uuid) is
  '#949: every typed-fact region #948''s persist door banked for the NEWEST agreement reading of one document, by field path. Ungranted; the ONE place this lane resolves a term to the region that prints it.';

create or replace function clara.propose_contract_terms(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $pct$
declare
  c record; v_client uuid; v_state jsonb; v_extraction uuid;
  v_class text; v_proposed jsonb := '[]'::jsonb; v_not_read jsonb := '[]'::jsonb;
  v_rent_region uuid; v_dep_region uuid; v_date_region uuid; v_term_region uuid;
  v_rent bigint; v_dep bigint; v_months int; v_start date;
  v_f jsonb; v_state_of text;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select f.client_id into v_client from clara.document_filings f
   where f.document_id = p_document and f.firm_id = c.firm and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_client is null then
    raise exception 'document % is not a live filing in your firm', p_document using errcode='CLR11';
  end if;

  select e.id, e.envelope->'contract_state' into v_extraction, v_state
    from clara.document_extractions e
   where e.document_id = p_document and e.engine_kind = 'agreement_text_facts' and e.status = 'done'
   order by e.version_n desc, e.extracted_at desc limit 1;
  if v_state is null then
    return jsonb_build_object('document_id', p_document, 'client_id', v_client,
      'agreement_class', null, 'extraction_id', null,
      'proposed', '[]'::jsonb, 'not_read', '[]'::jsonb, 'reason', 'agreement_not_read');
  end if;

  v_class := v_state->>'agreement_class';
  if v_class is distinct from 'tenancy' then
    return jsonb_build_object('document_id', p_document, 'client_id', v_client,
      'agreement_class', v_class, 'extraction_id', v_extraction,
      'proposed', '[]'::jsonb, 'not_read', '[]'::jsonb, 'reason', 'not_a_tenancy');
  end if;

  select tr.region_id into v_rent_region from clara._tenancy_term_regions(p_document) tr
   where tr.field_path = 'contract.agreement.instalment_amount';
  select tr.region_id into v_dep_region from clara._tenancy_term_regions(p_document) tr
   where tr.field_path = 'contract.agreement.deposit';
  select tr.region_id into v_date_region from clara._tenancy_term_regions(p_document) tr
   where tr.field_path = 'contract.agreement.agreement_date';
  select tr.region_id into v_term_region from clara._tenancy_term_regions(p_document) tr
   where tr.field_path = 'contract.agreement.term_months';

  -- 1 - THE MONTHLY RENT. A figure the page printed and both channels read the same way.
  v_f := v_state->'facts'->'contract.agreement.instalment_amount';
  v_state_of := v_f->>'state';
  v_rent := nullif(v_f->>'printed_cents','')::bigint;
  if v_state_of = 'established' and v_rent is not null and v_rent > 0 and v_rent_region is not null then
    v_proposed := v_proposed || jsonb_build_array(jsonb_build_object(
      'term_key','monthly_rent','amount_cents',v_rent,'printed_raw',v_f->>'printed_raw',
      'basis_kind','document_region','source_region_ids',jsonb_build_array(v_rent_region),
      'basis','the monthly rent this tenancy prints, read by the contract lane'));
  else
    v_not_read := v_not_read || jsonb_build_array(jsonb_build_object(
      'term_key','monthly_rent','reason',coalesce(v_state_of,'agreement_not_read')));
  end if;

  -- 2 - THE DEPOSIT. Zero is admitted here and nowhere else in this lane: a tenancy that states
  --     "no deposit" has stated a term, and `not printed` is a different answer again.
  v_f := v_state->'facts'->'contract.agreement.deposit';
  v_state_of := v_f->>'state';
  v_dep := nullif(v_f->>'printed_cents','')::bigint;
  if v_state_of = 'established' and v_dep is not null and v_dep_region is not null then
    v_proposed := v_proposed || jsonb_build_array(jsonb_build_object(
      'term_key','deposit','amount_cents',v_dep,'printed_raw',v_f->>'printed_raw',
      'basis_kind','document_region','source_region_ids',jsonb_build_array(v_dep_region),
      'basis','the deposit this tenancy states; signing does not say the money moved'));
  else
    v_not_read := v_not_read || jsonb_build_array(jsonb_build_object(
      'term_key','deposit','reason',coalesce(v_state_of,'agreement_not_read')));
  end if;

  -- 3 - THE TERM'S FIRST DAY, derived from the signing date the page printed.
  v_f := v_state->'facts'->'contract.agreement.agreement_date';
  v_state_of := v_f->>'state';
  v_start := case when v_state_of = 'established'
                  then clara._agreement_signed_date(v_f->>'printed_raw') end;
  if v_start is not null and v_date_region is not null then
    v_proposed := v_proposed || jsonb_build_array(jsonb_build_object(
      'term_key','term_start','term_date',to_char(v_start,'YYYY-MM-DD'),
      'printed_raw',v_f->>'printed_raw',
      'basis_kind','derived_from_regions','source_region_ids',jsonb_build_array(v_date_region),
      'basis','the day the agreement was signed; correct it where the tenancy commences later'));
  else
    v_not_read := v_not_read || jsonb_build_array(jsonb_build_object(
      'term_key','term_start','reason',
      case when v_state_of = 'established' then 'signing_date_unreadable'
           else coalesce(v_state_of,'agreement_not_read') end));
  end if;

  -- 4 - THE TERM'S LAST DAY. Needs BOTH the first day and the printed term in months, and it is
  --     INCLUSIVE: 24 months from 5 January 2026 ends on 4 January 2028.
  v_f := v_state->'facts'->'contract.agreement.term_months';
  v_state_of := v_f->>'state';
  v_months := case when v_state_of = 'established' and btrim(coalesce(v_f->>'printed_raw','')) ~ '^[0-9]{1,3}$'
                   then btrim(v_f->>'printed_raw')::int end;
  if v_start is not null and v_months is not null and v_months > 0
     and v_date_region is not null and v_term_region is not null then
    v_proposed := v_proposed || jsonb_build_array(jsonb_build_object(
      'term_key','term_end',
      'term_date',to_char((v_start + make_interval(months => v_months) - interval '1 day')::date,'YYYY-MM-DD'),
      'printed_raw',v_f->>'printed_raw',
      'basis_kind','derived_from_regions',
      'source_region_ids',jsonb_build_array(v_date_region, v_term_region),
      'basis',format('%s months from the first day, the last day included', v_months)));
  else
    v_not_read := v_not_read || jsonb_build_array(jsonb_build_object(
      'term_key','term_end','reason',
      case when v_start is null then 'term_start_not_established'
           when v_state_of = 'established' then 'term_months_unreadable'
           else coalesce(v_state_of,'agreement_not_read') end));
  end if;

  -- 5 - THE ESCALATION -- never read by this family, and the proposal says so rather than
  --     staying silent. A FROZEN questionnaire has eleven questions and none of them is a rent
  --     review; a person records it with their own basis.
  v_not_read := v_not_read || jsonb_build_array(jsonb_build_object(
    'term_key','escalation','reason','no_question_in_the_questionnaire'));

  return jsonb_build_object('document_id', p_document, 'client_id', v_client,
    'agreement_class', v_class, 'extraction_id', v_extraction,
    'proposed', v_proposed, 'not_read', v_not_read, 'reason', null);
end $pct$;

comment on function clara.propose_contract_terms(uuid) is
  '#949 AC1: the tenancy terms #948''s banked reading already establishes -- the monthly rent and the deposit as READINGS, the term''s first and last day as DERIVATIONS from the same regions -- each carrying the clara.document_regions row it came from, beside the terms this lane could not read and why (an escalation has no question in the frozen questionnaire at all). Writes nothing; a person turns it into a record through clara.record_contract_terms. viewer+, clara_authenticated only.';

revoke all on function clara.propose_contract_terms(uuid) from public;
grant execute on function clara.propose_contract_terms(uuid) to clara_authenticated;

reset role;

set role clara_fn_owner;

-- =====================================================================================
-- §E  THE LESSEE ACCOUNTING BRANCH (the OWNER'S RULING of 2026-09-20).
--
--     TWO BODIES. `clara._client_reporting_framework` answers "which framework are this
--     client's accounts prepared on, and who said so"; `clara._tenancy_lease_treatment` walks
--     the ruling's own branch and answers "may Clara draft a monthly rent expense here, or must
--     she state what she read and let the accountant decide".
--
--     THE FRAMEWORK READ. `reporting_framework` is a knowledge key (0192/#644): an
--     authority-bearing POLICY whose value carries {framework_code, framework_label, ...}
--     verbatim as the interview folds it. Its own catalog label says "DESCRIPTIVE in this slice
--     -- no posting or presentation code reads this row". THIS BODY IS THE FIRST READER, and it
--     reads it to ASK A QUESTION, never to post one: the whole point of the branch below is that
--     the framework decides whether Clara may draft, not what she may post.
--
--     AND IT IS A DECLARED MEMBER OF THE KNOWLEDGE COHORT (fix round, finding SPEC-07). #654's
--     own census -- knowledge-firm-defaults.test.mjs, "no function outside the knowledge cohort
--     reads clara.knowledge_records, and a knowledge record still cannot authorise a plan" --
--     names every reader with its reason and then MEASURES the claim on the live body. This one
--     was added without naming it there, and the census went red. It is declared now, with the
--     three properties the census checks and one more this file owes:
--       · it is STABLE and performs no DML against clara.knowledge_records (the census measures
--         both, with a positive control against 0192's real revision writer);
--       · it is UNGRANTED -- reachable by no application role at all (tail T.3);
--       · and the thing the census exists to stop does NOT happen here: a knowledge record never
--         becomes a plan's authority. The plan this lane creates cites
--         clara.contract_plan_confirmations -- a named person's own act -- and
--         clara.create_accounting_plan still refuses a knowledge_record reference outright, which
--         is the census's own second half and is left untouched.
--     The framework key decides whether Clara DRAFTS or ASKS. It authorises nothing.
--
--     PRECEDENCE, and why it is re-derived here rather than taken from
--     clara.get_knowledge_applicability: that read is a human-context door (it calls
--     clara._human_ctx and raises CLR11), and this body is an internal reached from a definer
--     that has ALREADY settled the firm and the client. It applies the SAME precedence that read
--     applies -- a live CLIENT record shadows a live FIRM record, each inside its effective
--     window -- and it answers `ambiguous` rather than picking when two live records of one
--     scope carry different framework codes under different applicability conditions. A
--     conditional framework is a real thing a firm may record; choosing between two of them from
--     a tenancy is not this lane's judgement to make.
--
--     THE BRANCH, in the ruling's own order and with its own words in the sentences:
--       0. THE TERMS MUST BE RECORDED. No monthly rent, no first day, no last day -> nothing to
--          decide about. `terms_incomplete`, naming which are missing.
--       1. A STATED ESCALATION ASKS, UNDER BOTH FRAMEWORKS. "Straight-line means the total rent
--          averaged over the term, so with a stated escalation the monthly expense differs from
--          the month's cash rent." Clara reads the escalation and states it; she does not average
--          anything, because whether the increases merely follow expected general inflation is a
--          judgement about the future that no body here can make.
--       2. THE FRAMEWORK MUST BE ESTABLISHED. Not recorded -> `framework_not_established`; a
--          framework that is neither MPERS nor MFRS -> `framework_not_decisive`. Each ASKS.
--       3. MPERS -> DRAFTS. Section 20: a lessee expenses operating-lease payments on a
--          straight-line basis over the lease term, and with level rent the straight line IS the
--          monthly rent.
--       4. MFRS with a term of 12 MONTHS OR LESS -> DRAFTS. MFRS 16's short-term lease
--          exemption: the lessee may expense the payments straight-line instead of recognising a
--          right-of-use asset.
--       5. MFRS with a term OVER 12 months -> ASKS. `mfrs_lease_over_twelve_months`: the lessee
--          recognises a right-of-use asset and a lease liability, then depreciation and interest
--          -- not a rent expense.
--
--     THE LOW-VALUE EXEMPTION IS NOT A BRANCH HERE, and that is deliberate rather than an
--     omission. MFRS 16 also exempts a lease of a LOW-VALUE asset, but the asset a tenancy of
--     premises conveys is never low value, and this lane only ever sees a tenancy (§D admits no
--     other class). A body that offered the exemption would be offering it for a case it cannot
--     arise in. The written basis says so out loud so a reader does not go looking for it.
--
--     IT MEASURES NOTHING IT CANNOT READ. No discount rate, no present value, no right-of-use
--     asset, no lease-liability schedule: full MFRS 16 measurement is out of scope by the
--     ruling's own last line and is a later ticket.
--
--     STABLE, ungranted, reached from the granted draft read and the confirm door alone.
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
create or replace function clara._client_reporting_framework(p_client uuid)
  returns jsonb language plpgsql stable set search_path = clara, pg_temp as $crf$
declare
  v_firm uuid; v_today date; v_codes text[]; v_scope text; v_record uuid; v_code text;
begin
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    return jsonb_build_object('framework_code', null, 'in_force', 'none', 'record_id', null);
  end if;
  -- THE HOUSE LEGAL DATE, FROM ITS ONE OWNER (fix round, finding SPEC-10). x42's own roster
  -- instruction: a body that SPELLS the conversion is a second owner of the legal business date.
  v_today := clara._book_today();

  for v_scope in select unnest(array['client','firm']) loop
    select array_agg(distinct r.value->>'framework_code'),
           (array_agg(r.id order by r.recorded_at desc))[1]
      into v_codes, v_record
      from clara.knowledge_records r
     where r.firm_id = v_firm and r.state = 'live'
       and r.knowledge_key = 'reporting_framework'
       and r.scope_kind = v_scope
       and (v_scope = 'firm' or r.client_id = p_client)
       and (r.effective_from is null or r.effective_from <= v_today)
       and (r.effective_to is null or r.effective_to >= v_today)
       and nullif(btrim(coalesce(r.value->>'framework_code','')),'') is not null;
    if coalesce(array_length(v_codes,1),0) = 1 then
      v_code := v_codes[1];
      return jsonb_build_object('framework_code', v_code, 'record_id', v_record,
        'in_force', case when v_scope = 'client' then 'client_exception' else 'firm_default' end);
    elsif coalesce(array_length(v_codes,1),0) > 1 then
      -- Two live records of ONE scope carrying DIFFERENT codes under different applicability
      -- conditions. A real firm may record exactly that; choosing between them from a tenancy
      -- is not this lane's judgement.
      return jsonb_build_object('framework_code', null, 'record_id', null,
        'in_force', 'ambiguous', 'codes', to_jsonb(v_codes),
        'scope', v_scope);
    end if;
  end loop;

  return jsonb_build_object('framework_code', null, 'in_force', 'none', 'record_id', null);
end $crf$;
revoke all on function clara._client_reporting_framework(uuid) from public;

comment on function clara._client_reporting_framework(uuid) is
  '#949: which reporting framework this client''s accounts are prepared on, from the reporting_framework knowledge key -- a live CLIENT record shadows a live FIRM record, each inside its effective window, and two live records of one scope carrying different codes answer `ambiguous` rather than picking. Ungranted; the first reader of a key 0192 registered as descriptive, and it reads it only to decide whether Clara may DRAFT.';

create or replace function clara._tenancy_lease_treatment(p_client uuid, p_document uuid)
  returns jsonb language plpgsql stable set search_path = clara, pg_temp as $tlt$
declare
  v_fw jsonb; v_code text; v_rent bigint; v_start date; v_end date; v_months int;
  v_esc jsonb; v_missing text[] := '{}';
  v_standard text; v_reason text := null; v_question text := null; v_drafts boolean := false;
  v_basis text;
begin
  -- THE WRITTEN ACCOUNTING BASIS. It names BOTH standards on every answer, because a person
  -- reading "Clara drafted a rent expense" needs to see the rule that let her and the rule that
  -- would have stopped her.
  v_basis := 'MPERS Section 20: a lessee CLASSIFIES a lease first -- a lease that transfers '
    || 'substantially all the risks and rewards of ownership (the term covers the major part of '
    || 'the asset''s economic life, or the minimum lease payments amount to substantially all of '
    || 'its fair value) is a FINANCE lease, carried as an asset and a liability with interest, '
    || 'not a rent expense -- and expenses an OPERATING lease on a straight-line basis over the '
    || 'lease term, so with LEVEL rent the straight line is the monthly rent. This lane asks for '
    || 'that classification on an MPERS lease running over TEN YEARS and takes the operating '
    || 'reading below it: premises have an economic life measured in decades, so a tenancy of a '
    || 'few years can convey neither the major part of that life nor substantially all of their '
    || 'fair value and the operating reading is not in doubt, while a lease running a decade or '
    || 'more is where the classification becomes a live judgement that a tenancy page cannot '
    || 'settle. The ten-year line is this lane''s own bound on WHEN to ask, not a threshold MPERS '
    || 'states -- MPERS states indicators, not a number. '
    || 'MFRS 16: a lessee recognises a right-of-use asset and a lease liability for a lease over '
    || '12 months, and only a short-term lease (12 months or less) or a low-value asset may be '
    || 'expensed straight-line -- the low-value exemption cannot arise for premises, so it is '
    || 'not offered here. A stated escalation makes the straight-line expense differ from the '
    || 'month''s cash rent, which is a judgement about the term rather than a figure this lane '
    || 'can read, so Clara states it and the accountant decides.';

  select ct.amount_cents into v_rent from clara.contract_terms ct
   where ct.document_id = p_document and ct.term_key = 'monthly_rent' and ct.superseded_at is null;
  select ct.term_date into v_start from clara.contract_terms ct
   where ct.document_id = p_document and ct.term_key = 'term_start' and ct.superseded_at is null;
  select ct.term_date into v_end from clara.contract_terms ct
   where ct.document_id = p_document and ct.term_key = 'term_end' and ct.superseded_at is null;
  select ct.escalation into v_esc from clara.contract_terms ct
   where ct.document_id = p_document and ct.term_key = 'escalation' and ct.superseded_at is null;

  if v_rent is null then v_missing := v_missing || 'monthly_rent'::text; end if;
  if v_start is null then v_missing := v_missing || 'term_start'::text; end if;
  if v_end is null then v_missing := v_missing || 'term_end'::text; end if;

  -- The term in WHOLE MONTHS, from the recorded first and last day. The last day is inclusive,
  -- so the span measured is [first day, last day + 1 day): 5 Jan 2026 to 4 Jan 2028 is 24 months.
  if v_start is not null and v_end is not null and v_end >= v_start then
    v_months := (extract(year from age((v_end + 1), v_start))::int * 12)
                + extract(month from age((v_end + 1), v_start))::int;
  end if;

  v_fw := clara._client_reporting_framework(p_client);
  v_code := v_fw->>'framework_code';

  if coalesce(array_length(v_missing,1),0) > 0 then
    v_reason := 'terms_incomplete';
    v_question := 'Record the tenancy''s terms before a rent plan can be proposed: '
      || array_to_string(v_missing, ', ') || ' has not been recorded for this agreement.';
    v_standard := null;
  elsif v_esc is not null then
    v_reason := 'escalation_stated';
    v_standard := case when v_code = 'MFRS' then 'MFRS 16' else 'MPERS Section 20' end;
    v_question := format(
      'This tenancy states an escalation to %s from %s. Straight-line means the total rent '
      || 'AVERAGED over the term, so the monthly expense differs from the month''s cash rent of '
      || '%s unless the increases only follow expected general inflation. That is a judgement '
      || 'about the term, so Clara has drafted nothing: decide the treatment and confirm it.',
      to_char((nullif(btrim(coalesce(v_esc->>'new_amount_cents','')),'')::bigint)/100.0,'FM999G999G990D00'),
      coalesce(v_esc->>'effective_from','(no date stated)'),
      to_char(v_rent/100.0,'FM999G999G990D00'));
  elsif v_code is null then
    v_reason := 'framework_not_established';
    v_question := 'Nobody has recorded which reporting framework these accounts are prepared on. '
      || 'MPERS expenses an operating lease straight-line; MFRS 16 recognises a right-of-use '
      || 'asset and a lease liability for a lease over 12 months. Record the framework in '
      || 'Knowledge, or decide the treatment and confirm it.';
  elsif v_code not in ('MPERS','MFRS') then
    v_reason := 'framework_not_decisive';
    v_question := format(
      'These accounts are prepared on %s, which this branch does not decide a lessee treatment '
      || 'from. MPERS Section 20 expenses an operating lease straight-line; MFRS 16 recognises a '
      || 'right-of-use asset and a lease liability for a lease over 12 months. Decide the '
      || 'treatment and confirm it.', v_code);
  elsif v_code = 'MPERS' and (v_months is null or v_months > 120) then
    -- MPERS ASKS TOO (fix round, finding ADV-05). The first cut drafted for EVERY MPERS lease,
    -- however long, which quietly assumed the OPERATING classification that MPERS Section 20
    -- makes the accountant establish: a 30-year ground lease was straight-lined as rent expense
    -- with no question raised and no judgement recorded (DRIVEN in the review, term restated to
    -- 360 months through clara.record_contract_terms). The owner's own principle -- Clara asks
    -- for a professional judgement -- was honoured on the MFRS side and skipped here. The
    -- indicators the standard names (economic life, fair value, transfer of ownership, a bargain
    -- purchase option, a specialised asset) are not readable off a tenancy page, which is exactly
    -- the case the ruling sends to a person.
    --
    -- WHY TEN YEARS AND NOT TWELVE MONTHS. MFRS 16's twelve-month line is the STANDARD'S own
    -- short-term exemption; MPERS Section 20 has no such line, only indicators, so a number here
    -- is this lane's judgement about when to ASK rather than a rule it is applying. Twelve months
    -- was the first cut of this fix and it was wrong in the other direction: it would have asked
    -- for a written classification on every two-year shoplot tenancy in the country, which is the
    -- noise the ruling's own "Clara asks for a professional judgement" is not about. Premises
    -- have an economic life measured in decades; a lease running a decade or more is where
    -- "the major part of the economic life" and "substantially all of the fair value" stop being
    -- obviously false. The owner may move this line, and the number lives in ONE place.
    v_reason := 'mpers_lease_classification'; v_standard := 'MPERS Section 20';
    v_question := format(
      'These accounts are prepared on MPERS and this lease runs %s months -- ten years or more. '
      || 'MPERS Section 20 has '
      || 'the lessee CLASSIFY the lease first: one that transfers substantially all the risks and '
      || 'rewards of ownership -- a term covering the major part of the premises'' economic life, '
      || 'or minimum lease payments amounting to substantially all of their fair value -- is a '
      || 'FINANCE lease, recognised as an asset and a liability with interest and depreciation, '
      || 'not a rent expense. Only an OPERATING lease is expensed straight-line. Nothing on this '
      || 'page says which it is. Clara has drafted nothing: the rent she read is %s a month, from '
      || '%s to %s. Decide the classification and confirm it.',
      coalesce(v_months::text,'an unmeasurable number of'),
      to_char(v_rent/100.0,'FM999G999G990D00'),
      to_char(v_start,'YYYY-MM-DD'), to_char(v_end,'YYYY-MM-DD'));
  elsif v_code = 'MPERS' then
    v_drafts := true; v_standard := 'MPERS Section 20';
  elsif v_months is not null and v_months <= 12 then
    v_drafts := true; v_standard := 'MFRS 16';
  else
    v_reason := 'mfrs_lease_over_twelve_months'; v_standard := 'MFRS 16';
    v_question := format(
      'These accounts are prepared on MFRS and this lease runs %s months. MFRS 16 has the lessee '
      || 'recognise a right-of-use asset and a lease liability, then depreciation and interest -- '
      || 'not a rent expense. Only a short-term lease of 12 months or less may be expensed '
      || 'straight-line. Clara has drafted nothing: the rent she read is %s a month, from %s to '
      || '%s. Decide the treatment and confirm it.',
      coalesce(v_months::text,'an unmeasurable number of'),
      to_char(v_rent/100.0,'FM999G999G990D00'),
      to_char(v_start,'YYYY-MM-DD'), to_char(v_end,'YYYY-MM-DD'));
  end if;

  return jsonb_build_object(
    'treatment_version','v1', 'drafts', v_drafts,
    'framework_code', v_code, 'framework_in_force', v_fw->>'in_force',
    'framework_record_id', v_fw->>'record_id',
    'monthly_rent_cents', v_rent,
    'term_start', to_char(v_start,'YYYY-MM-DD'), 'term_end', to_char(v_end,'YYYY-MM-DD'),
    'term_months', v_months, 'escalation', v_esc,
    'missing_terms', to_jsonb(v_missing),
    'standard', v_standard, 'basis', v_basis,
    'reason', v_reason, 'question', v_question);
end $tlt$;
revoke all on function clara._tenancy_lease_treatment(uuid,uuid) from public;

comment on function clara._tenancy_lease_treatment(uuid,uuid) is
  '#949 (owner ruling 2026-09-20): the lessee accounting branch. MPERS Section 20 with level rent DRAFTS a monthly rent expense for a lease of ten years or less and otherwise ASKS for the finance-vs-operating classification the standard makes the accountant establish (fix-round finding ADV-05); MFRS 16 DRAFTS only for a short-term lease of 12 months or less and otherwise ASKS (right-of-use asset + lease liability); a stated escalation ASKS under both, because straight-line means the total averaged over the term. Every answer carries the written accounting basis naming both standards, the term and the rent it read, and -- where it asks -- the question the accountant answers. It measures nothing: no discount rate, no present value, no schedule. Ungranted.';

reset role;

set role clara_fn_owner;

-- =====================================================================================
-- §F  THE DRAFT (AC2's first half, AC3's first half), AND THE RECORD OF THE ACT THAT CONFIRMS IT.
--
--     THE DRAFT IS A READ. It computes the recurring plan a person would confirm and it writes
--     NOTHING -- no plan row, no revision, no occurrence, no entry. "The plan does not start
--     running until a person confirms it" is true HERE by construction, and §G's confirm door is
--     the only writer in this lane.
--
--     THE SHAPE OF THE PLAN IT PROPOSES. `recurring_journal` (the surviving plan lane: 0282/#927
--     closed the 0045 template doors and pointed every caller at clara.create_accounting_plan),
--     monthly, over the tenancy's OWN term -- effective_from the first day and effective_to the
--     last. The due day is the term's own day of month where the plan lane admits it (1..28) and
--     `last_day_of_month` where it does not: `clara._assert_plan_schedule` refuses a day of 29,
--     30 or 31 precisely because those days do not exist in every month, and a tenancy that
--     starts on the 30th charges its rent at each month's end rather than on a day that is
--     sometimes missing.
--
--     THE BASIS DEBITS RENT EXPENSE AND CREDITS THE RENT PAYABLE -- NEVER A BANK ACCOUNT. The
--     brief's own reason, restated: "a plan that pays itself out of the bank account
--     double-counts the moment the real payment arrives on the statement and is coded, once as
--     the plan's own credit and once as the bank line's." So the money's own movement is the
--     BANK LINE's, matched later through §H, and this plan only ever recognises the expense and
--     the obligation.
--
--     ACCOUNTS ARE RESOLVED BY CODE IN THIS CLIENT'S OWN CHART, and each leg carries the NAME it
--     resolved to (the #948 drafting-body discipline). A code the client does not hold, or holds
--     inactive, is a NAMED refusal carrying the code -- never a silent substitution, and never an
--     account this lane creates. The defaults are `6100 Rental of Premises` and `2050 Rent
--     Payable`, consumed by code and name from the published standard chart; the confirm door
--     lets the accountant name others, which is the owner ruling's own "the accountant may still
--     choose another liability account when confirming the plan".
--
--     clara.contract_plan_confirmations IS THE PERSON'S ACT. It lives here, beside the draft,
--     because the draft READS it to say whether this tenancy already has a plan. It is
--     append-only in the strongest sense -- no UPDATE at all, ever -- because a confirmation is a
--     historical fact about a moment, not a record anyone later amends: a changed mind is a plan
--     revision, which is its own confirmation row. §G explains what it carries and why it is
--     what `clara.accounting_plans.authority_ref` names.
--
--     REDO-SAFE: `create or replace function`, `create table if not exists`.
-- =====================================================================================

-- The bank test, in ONE place so the draft, the confirm door and any later reader cannot disagree
-- about what "a bank account" is. TWO independent facts this database already holds: the chart
-- row's own `is_bank_account` flag (set when an account is mapped to a registered bank account)
-- and the client's own live registered bank accounts. Either one is enough to refuse.
create or replace function clara._tenancy_account_is_bank(p_client uuid, p_code text)
  returns boolean language sql stable set search_path = clara, pg_temp as $taib$
  select exists (select 1 from clara.coa_accounts a
                  where a.client_id = p_client and a.account_code = p_code
                    and coalesce(a.is_bank_account,false))
      or exists (select 1 from clara.bank_accounts ba
                  where ba.client_id = p_client and ba.coa_account_code = p_code and ba.active);
$taib$;
revoke all on function clara._tenancy_account_is_bank(uuid,text) from public;

comment on function clara._tenancy_account_is_bank(uuid,text) is
  '#949 AC3: is this account code one of the client''s own bank accounts? Two independent facts -- the chart row''s is_bank_account flag and a live registered clara.bank_accounts mapping -- so a rent plan can never credit the bank by taking the one route that was not checked. Ungranted.';

create table if not exists clara.contract_plan_confirmations (
  id                     uuid        primary key default gen_random_uuid(),
  firm_id                uuid        not null references clara.firms(id),
  client_id              uuid        not null,
  document_id            uuid        not null references clara.documents(id),
  kind                   text        not null check (kind in ('rent_plan','rent_plan_revision')),
  monthly_rent_cents     bigint      not null check (monthly_rent_cents > 0),
  rent_account_code      text        not null check (btrim(rent_account_code) <> ''),
  payable_account_code   text        not null check (btrim(payable_account_code) <> ''),
  term_start             date        not null,
  term_end               date        not null,
  -- THE WHOLE TREATMENT THE PERSON WAS LOOKING AT, frozen at the moment they said yes. A plan
  -- confirmed under MPERS and a plan confirmed under MFRS against a written judgement are
  -- different acts, and a later reader must be able to tell which one this was without
  -- re-deriving a branch whose inputs may since have moved.
  treatment              jsonb       not null check (jsonb_typeof(treatment) = 'object'),
  professional_judgement text        check (professional_judgement is null
                                            or btrim(professional_judgement) <> ''),
  confirmed_by           uuid        not null references clara.users(id),
  confirmed_at           timestamptz not null default now(),
  constraint fk_contract_plan_confirmations_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint ck_contract_plan_confirmations_term check (term_end >= term_start),
  -- WHEN THE BRANCH ASKED, A JUDGEMENT IS OWED. The standing owner ruling is "beta, nothing
  -- dark": a compliance gate PROMPTS, it never disables. So a person may still confirm a plan the
  -- standard may not admit -- but only by writing down the treatment they are taking, and the
  -- table refuses the row otherwise, so no code path can drop it.
  constraint ck_contract_plan_confirmations_judgement check (
    ((treatment->>'drafts')::boolean is true) or professional_judgement is not null)
);

comment on table clara.contract_plan_confirmations is
  '#949 AC2: one row per act of a named person confirming a tenancy''s rent plan (or its '
  'revision), carrying the agreement it was confirmed against, the figures and accounts '
  'confirmed, and the whole lessee-treatment branch as it stood at that moment. It is what '
  'clara.accounting_plans.authority_ref names for this lane -- the explicit instruction the plan '
  'lane requires -- and its confirmed_by is NOT NULL, which is what makes its EXISTENCE proof a '
  'person asked (the same reasoning clara.accounting_work.initiator carries, #977''s own ruling). '
  'No UPDATE and no DELETE: a changed mind is a revision, with its own row.';

create index if not exists ix_contract_plan_confirmations_document
  on clara.contract_plan_confirmations(document_id, kind, confirmed_at desc);
create index if not exists ix_contract_plan_confirmations_client
  on clara.contract_plan_confirmations(client_id, confirmed_at desc);

alter table clara.contract_plan_confirmations enable row level security;
alter table clara.contract_plan_confirmations force row level security;
drop policy if exists p_contract_plan_confirmations_owner on clara.contract_plan_confirmations;
create policy p_contract_plan_confirmations_owner on clara.contract_plan_confirmations
  for all to clara_fn_owner using (true) with check (true);
drop policy if exists p_contract_plan_confirmations_human on clara.contract_plan_confirmations;
create policy p_contract_plan_confirmations_human on clara.contract_plan_confirmations
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
-- NO AGENT-LANE GRANT (fix round, finding SPEC-08) -- see clara.contract_terms above for the
-- wall and the reason. DRIVEN: the sweep failed on this table by name before this change.
drop policy if exists p_contract_plan_confirmations_agent on clara.contract_plan_confirmations;
grant select on clara.contract_plan_confirmations to clara_authenticated;
revoke all on clara.contract_plan_confirmations from clara_agent_ro;

create or replace function clara._tf_contract_plan_confirmation_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $tfcpci$
begin
  raise exception 'a plan confirmation is a record of one moment: it is never % (revise the plan instead, which is its own confirmation)', lower(tg_op)
    using errcode='CLR08', detail='{"reason":"contract_plan_confirmation_immutable"}';
end $tfcpci$;

revoke all on function clara._tf_contract_plan_confirmation_immutable() from public;

comment on function clara._tf_contract_plan_confirmation_immutable() is
  '#949: clara.contract_plan_confirmations admits INSERT alone. UPDATE and DELETE are both refused outright -- a confirmation is what a named person did at a moment, and a changed mind is a revision with its own row.';

drop trigger if exists t_contract_plan_confirmations_immutable on clara.contract_plan_confirmations;
create trigger t_contract_plan_confirmations_immutable
  before delete or update on clara.contract_plan_confirmations
  for each row execute function clara._tf_contract_plan_confirmation_immutable();
drop trigger if exists t_contract_plan_confirmations_no_truncate on clara.contract_plan_confirmations;
create trigger t_contract_plan_confirmations_no_truncate
  before truncate on clara.contract_plan_confirmations
  for each statement execute function clara._tf_no_truncate();

create or replace function clara._tenancy_rent_plan_draft(p_client uuid, p_document uuid,
    p_rent_account text default null, p_payable_account text default null)
  returns jsonb language plpgsql stable set search_path = clara, pg_temp as $trpd$
declare
  v_tr jsonb; v_rent_code text; v_pay_code text; v_rent_name text; v_pay_name text;
  v_refusals jsonb := '[]'::jsonb; v_start date; v_end date; v_rent bigint;
  v_day int; v_day_rule text; v_dom int; v_memo text; v_premises text; v_state jsonb;
  v_months int; v_basis jsonb;
begin
  v_tr := clara._tenancy_lease_treatment(p_client, p_document);
  v_rent_code := coalesce(nullif(btrim(coalesce(p_rent_account,'')),''), '6100');
  v_pay_code  := coalesce(nullif(btrim(coalesce(p_payable_account,'')),''), '2050');

  v_rent := nullif(v_tr->>'monthly_rent_cents','')::bigint;
  v_start := nullif(v_tr->>'term_start','')::date;
  v_end := nullif(v_tr->>'term_end','')::date;
  v_months := nullif(v_tr->>'term_months','')::int;

  -- THE ACCOUNTS, by code, in THIS client's own chart. Both are resolved even when the treatment
  -- already asks, so a person is told about a missing account once rather than twice.
  select a.name into v_rent_name from clara.coa_accounts a
   where a.client_id = p_client and a.account_code = v_rent_code and a.is_active;
  if v_rent_name is null then
    v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('reason','account_not_in_chart',
      'detail', jsonb_build_object('account_code', v_rent_code, 'role', 'rent_expense')));
  end if;
  select a.name into v_pay_name from clara.coa_accounts a
   where a.client_id = p_client and a.account_code = v_pay_code and a.is_active;
  if v_pay_name is null then
    v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('reason','account_not_in_chart',
      'detail', jsonb_build_object('account_code', v_pay_code, 'role', 'rent_payable')));
  elsif clara._tenancy_account_is_bank(p_client, v_pay_code) then
    -- The wall §G enforces, reported HERE too so a person sees it before they click rather than
    -- after: a rent plan that credited the bank would double-count the real payment.
    v_refusals := v_refusals || jsonb_build_array(jsonb_build_object('reason','plan_credits_bank_account',
      'detail', jsonb_build_object('account_code', v_pay_code, 'account_name', v_pay_name)));
  end if;

  -- THE TREATMENT VERDICT IS NOT APPLIED HERE, DELIBERATELY. This body computes the SHAPE of the
  -- plan whenever the arithmetic and the chart allow one; the granted read (below) nulls it when
  -- the branch says Clara may not draft, and the confirm door (SecG) admits it against a written
  -- professional judgement. One body computing the shape and two callers applying two different
  -- rules to it is what keeps "what Clara drafts" and "what a person may confirm" from drifting
  -- into two arithmetics.
  if jsonb_array_length(v_refusals) > 0
     or v_rent is null or v_start is null or v_end is null then
    return jsonb_build_object('treatment', v_tr, 'plan', null, 'refusals', v_refusals);
  end if;

  v_day := extract(day from v_start)::int;
  if v_day between 1 and 28 then
    v_day_rule := 'day_of_month'; v_dom := v_day;
  else
    v_day_rule := 'last_day_of_month'; v_dom := null;
  end if;

  select e.envelope->'contract_state' into v_state from clara.document_extractions e
   where e.document_id = p_document and e.engine_kind = 'agreement_text_facts' and e.status = 'done'
   order by e.version_n desc, e.extracted_at desc limit 1;
  v_premises := nullif(btrim(coalesce(
    v_state->'facts'->'contract.agreement.asset_description'->>'printed_raw','')),'');
  v_memo := 'Monthly rent'
    || case when v_premises is null then '' else ' -- ' || left(v_premises, 200) end
    || format(' (tenancy %s to %s)', to_char(v_start,'YYYY-MM-DD'), to_char(v_end,'YYYY-MM-DD'));

  v_basis := jsonb_build_object(
    'posting_date', to_char(v_start,'YYYY-MM-DD'),
    'memo', v_memo, 'currency', 'MYR',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_rent_code, 'debit_cents', v_rent, 'credit_cents', 0,
        'description', v_memo),
      jsonb_build_object('account_code', v_pay_code, 'debit_cents', 0, 'credit_cents', v_rent,
        'description', v_memo)));

  return jsonb_build_object(
    'treatment', v_tr, 'refusals', '[]'::jsonb,
    'plan', jsonb_build_object(
      'kind','recurring_journal',
      'purpose', left('Monthly rent' || case when v_premises is null then ''
                      else ' -- ' || v_premises end, 300),
      'frequency','monthly', 'day_rule', v_day_rule, 'day_of_month', v_dom,
      'timezone','Asia/Kuala_Lumpur',
      'effective_from', to_char(v_start,'YYYY-MM-DD'),
      'effective_to', to_char(v_end,'YYYY-MM-DD'),
      'occurrences', v_months,
      'rent_account_code', v_rent_code, 'rent_account_name', v_rent_name,
      'payable_account_code', v_pay_code, 'payable_account_name', v_pay_name,
      'monthly_rent_cents', v_rent,
      'basis', v_basis));
end $trpd$;
revoke all on function clara._tenancy_rent_plan_draft(uuid,uuid,text,text) from public;

comment on function clara._tenancy_rent_plan_draft(uuid,uuid,text,text) is
  '#949 AC2/AC3: the recurring rent plan a person would confirm -- monthly, over the tenancy''s own term, debiting rent expense and crediting the rent payable, NEVER a bank account. A pure read: it writes no plan, no revision, no occurrence and no entry. A missing chart account, or a payable that is really a bank account, is a NAMED refusal and no basis is drafted at all. Ungranted; reached from clara.get_tenancy_rent_plan_draft and clara.confirm_tenancy_rent_plan.';

-- The live rent plan of one agreement, derived from the confirmation the plan cites as its
-- authority. ONE place, so the draft read, the settlement read, the escalation offer and the
-- queue cannot disagree about which plan belongs to which tenancy.
create or replace function clara._tenancy_rent_plan(p_document uuid)
  returns table(plan_id uuid, status text, confirmation_id uuid, client_id uuid, firm_id uuid,
                rent_account_code text, payable_account_code text, monthly_rent_cents bigint,
                term_start date, term_end date, confirmed_at timestamptz)
  language sql stable set search_path = clara, pg_temp as $trp$
  select p.id, p.status, cf.id, cf.client_id, cf.firm_id,
         cf.rent_account_code, cf.payable_account_code, cf.monthly_rent_cents,
         cf.term_start, cf.term_end, cf.confirmed_at
    from clara.contract_plan_confirmations cf
    join clara.accounting_plans p
      on p.authority_ref->>'kind' = 'contract_confirmation'
     and nullif(p.authority_ref->>'id','')::uuid = cf.id
   where cf.document_id = p_document and cf.kind = 'rent_plan' and p.status <> 'ended'
   order by cf.confirmed_at desc
   limit 1;
$trp$;
revoke all on function clara._tenancy_rent_plan(uuid) from public;

comment on function clara._tenancy_rent_plan(uuid) is
  '#949: the live (active or paused) rent plan of one tenancy, resolved through the confirmation the plan cites as its authority -- the ONE join between an agreement and its plan, so the draft read, the settlement read, the escalation offer and the queue cannot disagree. Ungranted.';

create or replace function clara.get_tenancy_rent_plan_draft(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $gtrpd$
declare c record; v_client uuid; v_state jsonb; v_draft jsonb; v_plan record;
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
  if (v_state->>'agreement_class') is distinct from 'tenancy' then
    return jsonb_build_object('document_id', p_document, 'client_id', v_client,
      'agreement_class', v_state->>'agreement_class',
      'treatment', null, 'plan', null,
      'refusals', jsonb_build_array(jsonb_build_object('reason','not_a_tenancy',
        'detail', jsonb_build_object('agreement_class', v_state->>'agreement_class'))),
      'confirmed', false, 'plan_id', null, 'inert', true);
  end if;

  v_draft := clara._tenancy_rent_plan_draft(v_client, p_document);
  select * into v_plan from clara._tenancy_rent_plan(p_document);

  -- CLARA DRAFTS NOTHING WHEN THE STANDARD MAY NOT ADMIT THE TREATMENT (the owner's ruling). The
  -- terms, the question and the standard still travel, because a person deciding needs to see
  -- what she read; the basis does not, because a basis on screen is an offer to post it.
  return jsonb_build_object('document_id', p_document, 'client_id', v_client,
    'agreement_class', 'tenancy',
    'treatment', v_draft->'treatment',
    'plan', case when (v_draft->'treatment'->>'drafts')::boolean is true
                 then v_draft->'plan' end,
    'refusals', v_draft->'refusals',
    'confirmed', v_plan.plan_id is not null,
    'plan_id', v_plan.plan_id, 'plan_status', v_plan.status,
    'inert', v_plan.plan_id is null);
end $gtrpd$;

comment on function clara.get_tenancy_rent_plan_draft(uuid) is
  '#949 AC2: the rent plan this tenancy would run, with the lessee-treatment branch that decided whether Clara may draft it at all, and whether a person has already confirmed one. Derived entirely from live state; writes nothing. viewer+, clara_authenticated only.';

revoke all on function clara.get_tenancy_rent_plan_draft(uuid) from public;
grant execute on function clara.get_tenancy_rent_plan_draft(uuid) to clara_authenticated;

reset role;

-- =====================================================================================
-- §G  THE CONFIRMATION (AC2's second half, AC3's refusal).
--
--     "The plan does not start running until a person confirms it, and that confirmation is the
--     explicit instruction the plan lane requires, with the agreement standing as its source
--     document." (the brief.) This section makes that literally true in the plan lane's own
--     terms, by WIDENING what `clara.accounting_plans.authority_ref` may name -- additively, and
--     without loosening the rule #977 put there.
--
--     WHY A THIRD `authority_ref` KIND RATHER THAN A REUSE. The plan lane admits two kinds today:
--     an `accounting_work` (accepted because `clara.accounting_work.initiator` is NOT NULL, so
--     the row cannot exist without naming the person who asked -- the owner's #977 ruling says
--     exactly that) and a `chat_task` narrowed to a human-authored `chat_turn`. A person clicking
--     Confirm on a contract page is NEITHER: there is no Work, and there is no chat turn. The
--     three routes considered and rejected:
--       · admitting a Work for the confirmation -- an `accounting_work` row is a RUN the estate
--         will pick up and execute; minting one to serve as a receipt would start a run nobody
--         asked for;
--       · minting a `chat_turn` -- a turn nobody typed is a fabricated instruction, the exact
--         thing #977 exists to stop;
--       · naming the DOCUMENT -- a document is a thing a model read, not a person's instruction.
--         That would REGRESS #977 rather than extend it.
--     So the confirmation itself is the row, and `clara.contract_plan_confirmations.confirmed_by`
--     is NOT NULL, which is the SAME property that makes an `accounting_work` acceptable. The
--     agreement rides ON that row (`document_id`), which is how "the agreement is recorded as the
--     source document" is satisfied without weakening what an instruction is.
--
--     0250's own last line invited this: "a raise rather than a quiet refusal, so a future lane
--     that widens the admitted kinds finds this line instead of a silent 'unresolved'." §G.1 is
--     that lane, and it splices the arm in immediately above that raise.
--
--     TWO SPLICES, both ADDITIVE, both marker-detecting so a redo is a no-op:
--       G.1  clara._authority_ref_refusal(text,uuid,uuid,uuid) gains the third arm.
--       G.2  clara.create_accounting_plan(...)'s shape wall admits the third kind by name.
--     `clara.sign_depreciation_authority` carries the SAME shape wall and is DELIBERATELY not
--     touched: a fixed-asset depreciation authority is not a tenancy, and widening a door for a
--     kind that can never reach it would be widening it for nothing.
-- =====================================================================================
set role clara_fn_owner;

do $p949_auth_arm$
declare
  v_sig text := 'clara._authority_ref_refusal(text,uuid,uuid,uuid)';
  v_def text; v_next text; v_code text; v_anchor text; v_repl text;
  v_n int; v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  if position('contract_confirmation' in v_code) <> 0 then
    raise notice '#949 G.1: clara._authority_ref_refusal already carries the contract_confirmation arm -- splice already applied, nothing to do (redo)';
  else
    if v_pre_sha <> 'd70256f4208f6caf20e30259958f66d08ff1b445522399fc0c7f844f2cdea435' then
      raise exception '#949 G.1 prestate: clara._authority_ref_refusal is not at its pinned #977 body (sha %) -- re-derive this splice against the live body', v_pre_sha
        using errcode='CLR10';
    end if;

    v_anchor := '  raise exception ''clara._authority_ref_refusal: unknown authority reference kind %'', coalesce(p_ref_kind, ''(null)'')';
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#949 G.1 prestate: the unknown-kind raise appears % time(s) in the live body (expected 1)', v_n
        using errcode='CLR10';
    end if;

    v_repl := $p949arm$  if p_ref_kind = 'contract_confirmation' then
    -- #949 (0300): THE TENANCY LANE'S OWN INSTRUCTION, and it is admitted for the SAME reason
    -- the accounting_work arm is, not a weaker one: clara.contract_plan_confirmations.
    -- confirmed_by is NOT NULL, so the row cannot exist without naming the person who confirmed
    -- the plan. Its EXISTENCE in this firm and client is the proof this door needs. The row also
    -- carries the agreement it was confirmed against, which is how a rent plan records its
    -- source document without a document ever being mistaken for an instruction.
    if exists (select 1 from clara.contract_plan_confirmations cf
                where cf.id = p_ref_id and cf.firm_id = p_firm and cf.client_id = p_client) then
      return null;
    end if;
    return 'authority_ref_unresolved';
  end if;

  raise exception 'clara._authority_ref_refusal: unknown authority reference kind %', coalesce(p_ref_kind, '(null)')$p949arm$;
    v_next := replace(v_def, v_anchor, v_repl);
    if position('contract_confirmation' in v_next) = 0 then
      raise exception '#949 G.1 splice: the anchor did not rewrite' using errcode='CLR10';
    end if;
    if v_next = v_def then
      raise exception '#949 G.1 splice: no byte moved -- refusing a no-op apply' using errcode='CLR10';
    end if;

    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#949 G.1 postcheck: clara._authority_ref_refusal changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode='CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#949 G.1 postcheck: the definition did not move -- the splice was a no-op'
        using errcode='CLR10';
    end if;

    -- ADDITIVE, PROVEN: both arms #977 shipped survive verbatim.
    v_def := (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure);
    if position('if p_ref_kind = ''accounting_work'' then' in v_def) = 0
       or position('if p_ref_kind = ''chat_task'' then' in v_def) = 0
       or position('authority_ref_not_human_instruction' in v_def) = 0 then
      raise exception '#949 G.1 postcheck: an arm #977 shipped no longer appears in the body'
        using errcode='CLR10';
    end if;

    raise notice '#949 G.1: clara._authority_ref_refusal gains the contract_confirmation arm; both #977 arms survive, owner (%) and ACL byte-unchanged. definition sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;
end
$p949_auth_arm$;

do $p949_plan_kind$
declare
  v_sig text := 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)';
  v_def text; v_next text; v_code text; v_anchor text; v_repl text;
  v_n int; v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  if position('contract_confirmation' in v_code) <> 0 then
    raise notice '#949 G.2: clara.create_accounting_plan already admits contract_confirmation -- splice already applied, nothing to do (redo)';
  else
    if v_pre_sha <> '13f0d80556e60828875203bc9a290f7d325d4d067c4079e5ef6d25632a25a055' then
      raise exception '#949 G.2 prestate: clara.create_accounting_plan is not at its pinned live body (sha %) -- re-derive this splice against the live body', v_pre_sha
        using errcode='CLR10';
    end if;

    v_anchor := '  if v_ref_kind is null or v_ref_kind not in (''accounting_work'',''chat_task'') then' || chr(10)
             || '    raise exception ''a plan authority reference names an accounting_work or a chat_task''';
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#949 G.2 prestate: the authority-kind wall appears % time(s) in the live body (expected 1)', v_n
        using errcode='CLR10';
    end if;

    v_repl := $p949kind$  -- #949 (0300): a THIRD kind, additively. clara.contract_plan_confirmations is the tenancy
  -- lane's own record of a named person confirming a rent plan; clara._authority_ref_refusal
  -- resolves it under the same firm-and-client ladder as the other two.
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task','contract_confirmation') then
    raise exception 'a plan authority reference names an accounting_work, a chat_task or a contract_confirmation'$p949kind$;
    v_next := replace(v_def, v_anchor, v_repl);
    if position('''contract_confirmation'')' in v_next) = 0 then
      raise exception '#949 G.2 splice: the anchor did not rewrite' using errcode='CLR10';
    end if;
    if v_next = v_def then
      raise exception '#949 G.2 splice: no byte moved -- refusing a no-op apply' using errcode='CLR10';
    end if;

    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#949 G.2 postcheck: clara.create_accounting_plan changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode='CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#949 G.2 postcheck: the definition did not move -- the splice was a no-op'
        using errcode='CLR10';
    end if;

    -- ADDITIVE, PROVEN: every other wall this door carries survives at its own literal.
    v_def := (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure);
    if position('authority_rule_unsupported' in v_def) = 0
       or position('plan_kind_unsupported' in v_def) = 0
       or position('clara._authority_ref_refusal(v_ref_kind, v_ref_id, v_firm, p_client)' in v_def) = 0
       or position('authority_ref_not_human_instruction' in v_def) = 0 then
      raise exception '#949 G.2 postcheck: a wall clara.create_accounting_plan carried before this splice is gone'
        using errcode='CLR10';
    end if;

    raise notice '#949 G.2: clara.create_accounting_plan admits contract_confirmation beside the two kinds it carried; every other wall survives, owner (%) and ACL byte-unchanged. definition sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;
end
$p949_plan_kind$;

-- =====================================================================================
-- §G.3  clara.confirm_tenancy_rent_plan -- THE DOOR A PERSON PRESSES.
--
--     It records the act FIRST and creates the plan SECOND, citing the act. That order is what
--     makes the authority resolvable inside one transaction, and it is also the honest order: the
--     instruction exists, and then the schedule it authorises does.
--
--     THE FOUR REFUSALS, each by name:
--       plan_credits_bank_account       -- the payable named is one of this client's bank
--                                          accounts. The brief's own reason travels in the
--                                          message: the statement line that pays the rent would
--                                          be counted twice.
--       account_not_in_chart            -- a code this client does not hold active.
--       professional_judgement_required -- the lessee branch asked, and nobody wrote down the
--                                          treatment they are taking. The message IS the branch's
--                                          own question, so the words on screen and the decision
--                                          the lane took come out of one body.
--       rent_plan_already_confirmed     -- this tenancy already runs a plan, named by id. Ending
--                                          that plan is the plan lane's own act, not this door's.
--       payable_account_in_use          -- ANOTHER tenancy's live rent plan already uses the
--                                          payable account named. The open-rent read is a FIFO
--                                          over that account's own balance, so two live plans on
--                                          one account would share a single payment pool and each
--                                          other's months (fix-round finding ADV-03).
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
create or replace function clara.confirm_tenancy_rent_plan(p_client uuid, p_document uuid,
    p_rent_account text, p_payable_account text, p_judgement text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $ctrp$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_filing uuid; v_kind text;
  v_draft jsonb; v_tr jsonb; v_plan jsonb; v_refusal jsonb; v_existing record;
  v_judgement text; v_confirmation uuid; v_purpose text; v_created jsonb;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'confirming a rent plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select f.id into v_filing from clara.document_filings f
   where f.document_id = p_document and f.client_id = p_client and f.firm_id = c.firm
     and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_filing is null then
    raise exception 'document % is not a live filing of this client', p_document using errcode='CLR11';
  end if;
  select d.document_kind into v_kind from clara.documents d where d.id = p_document;
  if v_kind is distinct from 'agreement_contract' then
    raise exception 'a rent plan is confirmed against an agreement contract, not a %', coalesce(v_kind,'(unclassified)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','confirm_wrong_kind','kind',v_kind)::text;
  end if;

  v_judgement := nullif(btrim(coalesce(p_judgement,'')),'');

  v_dedupe := clara._reserve_op(c.firm, 'confirm_tenancy_rent_plan', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'document', p_document,
      'rent_account', p_rent_account, 'payable_account', p_payable_account,
      'judgement', v_judgement)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- ALREADY RUNNING? Derived from the confirmation the live plan cites, never a marker.
  select * into v_existing from clara._tenancy_rent_plan(p_document);
  if v_existing.plan_id is not null then
    raise exception 'this tenancy already runs a rent plan; revise or end that plan rather than confirming a second'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','rent_plan_already_confirmed',
          'plan_id', v_existing.plan_id, 'plan_status', v_existing.status,
          'confirmation_id', v_existing.confirmation_id)::text;
  end if;

  -- ONE LIVE RENT PLAN PER PAYABLE ACCOUNT (fix round, finding ADV-03). The open-rent read is a
  -- FIFO over the payable ACCOUNT's own balance, because 2050 has no subledger -- so two live
  -- tenancies pointed at one account share a single payment pool and each other's months. The
  -- first cut refused only a second plan on the SAME DOCUMENT, which let exactly that in. The
  -- remedy is the accountant's own choice the owner's ruling already gives them: point the second
  -- tenancy at its own liability account. Named refusal, carrying the tenancy that holds it.
  select cf.document_id, cf.id as confirmation_id, p.id as plan_id into v_existing
    from clara.contract_plan_confirmations cf
    join clara.accounting_plans p
      on p.authority_ref->>'kind' = 'contract_confirmation'
     and nullif(p.authority_ref->>'id','')::uuid = cf.id
   where cf.client_id = p_client and cf.kind = 'rent_plan' and p.status <> 'ended'
     and cf.payable_account_code = coalesce(nullif(btrim(coalesce(p_payable_account,'')),''), '2050')
   order by cf.confirmed_at desc limit 1;
  if v_existing.plan_id is not null then
    raise exception 'account % already carries another tenancy''s live rent plan; a second plan on one payable account would share its payments month for month -- give this tenancy its own liability account', coalesce(nullif(btrim(coalesce(p_payable_account,'')),''), '2050')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','payable_account_in_use',
          'payable_account_code', coalesce(nullif(btrim(coalesce(p_payable_account,'')),''), '2050'),
          'plan_id', v_existing.plan_id, 'document_id', v_existing.document_id,
          'confirmation_id', v_existing.confirmation_id)::text;
  end if;

  v_draft := clara._tenancy_rent_plan_draft(p_client, p_document, p_rent_account, p_payable_account);
  v_tr := v_draft->'treatment';

  select value into v_refusal from jsonb_array_elements(v_draft->'refusals')
   where value->>'reason' = 'plan_credits_bank_account' limit 1;
  if v_refusal is not null then
    raise exception 'a rent plan may not credit % -- it is one of this client''s own bank accounts, and a plan that pays itself out of the bank double-counts the statement line that pays it', v_refusal->'detail'->>'account_code'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_credits_bank_account',
          'account_code', v_refusal->'detail'->>'account_code',
          'account_name', v_refusal->'detail'->>'account_name')::text;
  end if;
  select value into v_refusal from jsonb_array_elements(v_draft->'refusals')
   where value->>'reason' = 'account_not_in_chart' limit 1;
  if v_refusal is not null then
    raise exception 'account % is not in this client''s chart (or is inactive); add it before confirming the plan', v_refusal->'detail'->>'account_code'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','account_not_in_chart',
          'account_code', v_refusal->'detail'->>'account_code',
          'role', v_refusal->'detail'->>'role')::text;
  end if;

  v_plan := v_draft->'plan';
  if v_plan is null or jsonb_typeof(v_plan) <> 'object' then
    raise exception 'there is no rent plan to confirm: %', coalesce(v_tr->>'question','the tenancy''s terms are not complete')
      using errcode='CLR10',
        detail=jsonb_build_object('reason', coalesce(v_tr->>'reason','terms_incomplete'),
          'missing_terms', v_tr->'missing_terms')::text;
  end if;

  -- THE BRANCH ASKED -> A WRITTEN JUDGEMENT IS OWED (the owner's ruling, and "beta, nothing
  -- dark": a compliance gate PROMPTS, it never disables). The message is the branch's OWN
  -- question, so the sentence on screen and the decision the lane took come out of one body.
  if (v_tr->>'drafts')::boolean is not true and v_judgement is null then
    raise exception '%', v_tr->>'question'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','professional_judgement_required',
          'treatment_reason', v_tr->>'reason', 'standard', v_tr->>'standard')::text;
  end if;

  v_confirmation := gen_random_uuid();
  insert into clara.contract_plan_confirmations(id, firm_id, client_id, document_id, kind,
      monthly_rent_cents, rent_account_code, payable_account_code, term_start, term_end,
      treatment, professional_judgement, confirmed_by)
    values (v_confirmation, c.firm, p_client, p_document, 'rent_plan',
      (v_plan->>'monthly_rent_cents')::bigint,
      v_plan->>'rent_account_code', v_plan->>'payable_account_code',
      (v_plan->>'effective_from')::date, (v_plan->>'effective_to')::date,
      v_tr, v_judgement, c.actor);

  v_purpose := left((v_plan->>'purpose')
    || case when v_judgement is null then ''
            else format(' (confirmed on a professional judgement under %s)',
                        coalesce(v_tr->>'standard','the applicable framework')) end, 300);

  -- THE PLAN LANE'S OWN DOOR, called rather than re-implemented: every schedule check, every
  -- overlap advisory, every idempotency and locking rule 0193 carries applies to this plan
  -- unchanged. The authority it cites is the row inserted a moment ago.
  v_created := clara.create_accounting_plan(
    p_client => p_client,
    p_kind => 'recurring_journal',
    p_purpose => v_purpose,
    p_authority_kind => 'explicit_instruction',
    p_authority_ref => jsonb_build_object('kind','contract_confirmation','id',v_confirmation),
    p_frequency => v_plan->>'frequency',
    p_day_rule => v_plan->>'day_rule',
    p_day_of_month => nullif(v_plan->>'day_of_month','')::int,
    p_timezone => v_plan->>'timezone',
    p_effective_from => (v_plan->>'effective_from')::date,
    p_effective_to => (v_plan->>'effective_to')::date,
    p_basis => v_plan->'basis',
    p_reversal_day_rule => null,
    p_op_key => p_op_key || ':plan');

  perform clara._audit(c.firm, c.actor, null, null, 'confirm_tenancy_rent_plan', null,
    jsonb_build_object('client', p_client, 'document', p_document,
      'confirmation', v_confirmation, 'plan', v_created->>'plan_id',
      'treatment_reason', v_tr->>'reason', 'standard', v_tr->>'standard',
      'judgement_given', v_judgement is not null));

  return clara._finish_op(c.firm, 'confirm_tenancy_rent_plan', p_op_key,
    jsonb_build_object('document_id', p_document, 'client_id', p_client,
      'confirmation_id', v_confirmation,
      'plan_id', v_created->>'plan_id', 'revision_id', v_created->>'revision_id',
      'status', v_created->>'status',
      'occurrences', v_plan->'occurrences',
      'next_occurrences', v_created->'next_occurrences',
      'overlap_warning', v_created->'overlap_warning',
      'treatment', v_tr, 'professional_judgement', v_judgement));
end $ctrp$;

comment on function clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text) is
  '#949 AC2/AC3: a named person confirms the tenancy''s rent plan. The confirmation is recorded FIRST (clara.contract_plan_confirmations, carrying the agreement as its source document and the lessee-treatment branch as it stood), and the plan is created SECOND through clara.create_accounting_plan citing that act as its explicit instruction. It refuses a bank credit by name, a payable account another tenancy''s live rent plan already uses, a missing chart account by code, and -- where the lessee branch asked -- a confirmation with no written professional judgement, quoting the branch''s own question. bookkeeper+, clara_authenticated only.';

revoke all on function clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text) from public;
grant execute on function clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text) to clara_authenticated;

reset role;

set role clara_fn_owner;

-- =====================================================================================
-- §H  THE OPEN RENT PAYABLE AND THE BANK LINE THAT SETTLES IT (AC4, and AC3's second half).
--
--     THE SETTLEMENT CANDIDATE ROW, THIRD INSTANCE. CONTEXT.md's own definition, applied here
--     unchanged: DERIVED from live facts every time it is read, storing nothing, clearing itself
--     the moment the underlying facts stop producing it, offering candidates and never choosing.
--     #657's pending bank line was the first instance and #947's unsettled payroll net pay the
--     second (migration 0298); this file reuses 0298's four bodies as its template rather than
--     inventing a second mechanism, which is WAVE-4 LANE RULE (c) in full.
--
--     "UNSETTLED" IS A LEDGER FACT, NOT A MARKER, and that is what makes AC4's "clears itself
--     when the settlement posts, BY ANY ROUTE, with no dismissal record" true by construction.
--     The read is a FIFO allocation over the rent plan's OWN payable account: every approved,
--     non-reversed CREDIT on that account (a month of rent recognised, however it was booked)
--     against every approved, non-reversed DEBIT on it (a payment, however it was booked --
--     Clara's own door below, a person's hand-booked cheque, or that entry later reconciled
--     through the ordinary bank matcher). Oldest month charged first, which is the ordinary
--     open-item reading applied to one account's running balance.
--
--     WHICH ACCOUNT, AND WHY THE PLAN IS WHAT SAYS SO. `2050 Rent Payable` is the standard
--     chart's own row and the draft's own default, but the owner's ruling lets the accountant
--     choose another liability account when confirming. So the account is read off the
--     CONFIRMATION -- the same row the plan cites as its authority -- and a client with no
--     confirmed rent plan has no open rent payable in this lane at all, however many liabilities
--     they carry. Where two rent plans of one client share one payable account the read is per
--     ACCOUNT (a ledger balance has no idea which plan credited it) and each open month is
--     attributed to the most recently confirmed plan on that account; two plans on one account is
--     a bookkeeping choice a firm may make, and the FIFO is the honest reading of it.
--
--     THE MONTH is `date_trunc('month', posting_date)`, read off the entry itself, never off the
--     plan's schedule: a month posted late is still that month's rent, and a plan whose schedule
--     was revised does not restate what was already booked.
--
--     THE ACCEPT DOOR books Dr <payable> / Cr <bank COA> for the month's own unsettled cents,
--     approves it directly (`via_wake_kind='interactive'`, a human's own accept act), writes the
--     receipt, and then calls `clara._match_bank_line_core` DIRECTLY -- the ctx-threading idiom
--     #655/#657 established and #947 restated -- so every lock, exclusivity guarantee and
--     exception wall that already protects a bank line from being claimed twice protects this
--     settlement too, unchanged. No `bank_matches`, `bank_match_line_members` or
--     `bank_match_entry_members` row is written anywhere in this file's own code.
--
--     THE AMOUNT IS NEVER RE-TYPED. p_client/p_entry/p_line name WHICH candidate was accepted;
--     the settled amount is read off the ledger at lock time and the bank line must carry exactly
--     that amount (negative, money leaving) or the call refuses BY NAME -- so a stale candidate
--     list cannot silently post the wrong figure.
--
--     A CHEQUE IS THE SAME CASE, and the brief says so: the payable stays open until the cheque
--     appears on the statement, which is the only moment Clara can see. Nothing here treats a
--     cheque specially; the owner may later flip the default to a written-date treatment, and
--     that flip belongs to whatever records the written date, not to this read.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
create or replace function clara._rent_payable_unsettled(p_client uuid)
  returns table(entry_id uuid, plan_id uuid, document_id uuid, filing_id uuid,
                posting_date date, period_month date, payable_account_code text,
                rent_cents bigint, unsettled_cents bigint)
  language sql stable security definer set search_path = clara, pg_temp
  as $rpu$
  -- ONE ROW PER LIVE RENT PLAN (fix round, finding ADV-03). The first cut kept
  -- `distinct on (cf.payable_account_code)`, which COLLAPSED two tenancies sharing one payable
  -- account into the most recently confirmed one: both tenancies' rent months were then presented
  -- under one document and their two payment streams netted against each other. §G's confirm door
  -- now refuses a payable account another live rent plan already uses, so the collapse cannot be
  -- created any more; this read no longer depends on that being true.
  with plans as (
    select p.id as plan_id, cf.id as confirmation_id, cf.document_id, cf.payable_account_code,
           cf.term_start, cf.term_end, cf.confirmed_at
      from clara.contract_plan_confirmations cf
      join clara.accounting_plans p
        on p.authority_ref->>'kind' = 'contract_confirmation'
       and nullif(p.authority_ref->>'id','')::uuid = cf.id
     where cf.client_id = p_client and cf.kind = 'rent_plan' and p.status <> 'ended'
  ),
  -- EACH RENT CREDIT BELONGS TO ONE PLAN, not to every plan on the account. Where two live plans
  -- still share an account (a pre-fix confirmation), the credit goes to the plan whose own term
  -- window contains the posting date, and only then to the most recently confirmed -- so the
  -- attribution is a fact about the tenancy's dates rather than about which plan was newest.
  rent_lines as (
    select distinct on (jl.entry_id, jl.line_no)
           pl.plan_id, pl.document_id, pl.payable_account_code,
           je.id as entry_id, jl.line_no, je.posting_date,
           date_trunc('month', je.posting_date)::date as period_month,
           jl.credit_cents as amt
      from plans pl
      join clara.journal_lines jl
        on jl.account_code = pl.payable_account_code and jl.credit_cents > 0
      join clara.journal_entries je on je.id = jl.entry_id
     -- A REVERSAL MIRROR IS NOT A MONTH OF RENT (fix round, finding ADV-02's twin on the credit
     -- side): reversing a rent SETTLEMENT mirrors Cr <payable>, which the first cut counted as a
     -- fresh month of rent recognised.
     where je.client_id = p_client and je.status = 'approved'
       and je.reversed_by is null and je.reversal_of is null
     order by jl.entry_id, jl.line_no,
       (je.posting_date >= pl.term_start
         and je.posting_date <= coalesce(pl.term_end, 'infinity'::date)) desc,
       pl.confirmed_at desc, pl.plan_id
  ),
  credits as (
    select r.plan_id, r.document_id, r.payable_account_code, r.entry_id, r.line_no,
           r.posting_date, r.period_month, r.amt,
           sum(r.amt) over (
             partition by r.payable_account_code
             order by r.posting_date, r.entry_id, r.line_no
             rows between unbounded preceding and current row) as cum_credit
      from rent_lines r
  ),
  debits as (
    -- A REVERSAL MIRROR IS NOT A PAYMENT (fix round, finding ADV-02 -- DRIVEN: reversing March's
    -- rent left an approved, non-reversed DEBIT on the payable, which was FIFO-allocated against
    -- FEBRUARY's credit and made a genuinely unpaid month disappear from this read, from Needs
    -- you and from the settlement door). Reversing a rent SETTLEMENT mirrors Cr <payable>, never
    -- a debit, so this line drops nothing that belongs in the pool -- and that reversal correctly
    -- re-opens the month, because the settlement's own debit leaves the pool with it.
    select pa.payable_account_code,
           coalesce((select sum(jl.debit_cents)
                       from clara.journal_lines jl
                       join clara.journal_entries je on je.id = jl.entry_id
                      where jl.account_code = pa.payable_account_code and jl.debit_cents > 0
                        and je.client_id = p_client and je.status = 'approved'
                        and je.reversed_by is null
                        and je.reversal_of is null), 0) as total_debits
      from (select distinct payable_account_code from plans) pa
  )
  select c.entry_id, c.plan_id, c.document_id, f.id, c.posting_date, c.period_month,
         c.payable_account_code, c.amt,
         -- this month's share of the payment pool: whatever remains after every OLDER month has
         -- taken its own FIFO share first (prior_credit = cum_credit - amt, this month excluded).
         greatest(0, c.amt - greatest(0, d.total_debits - (c.cum_credit - c.amt)))
    from credits c
    join debits d on d.payable_account_code = c.payable_account_code
    left join lateral (select f2.id from clara.document_filings f2
                        where f2.document_id = c.document_id and f2.retired_at is null
                        order by f2.filed_at desc limit 1) f on true;
$rpu$;
revoke all on function clara._rent_payable_unsettled(uuid) from public;

comment on function clara._rent_payable_unsettled(uuid) is
  '#949 AC4: per client, every month of rent recognised on a confirmed rent plan''s own payable account, with its FIFO-allocated remaining balance -- oldest month charged first against every approved, non-reversed, non-mirror debit on that account, however it was booked. One row per live plan, never one per account: a credit is attributed to the plan whose own term window contains it (fix-round findings ADV-02 and ADV-03). A pure ledger fact: no settlement marker is read or required, so the row clears itself by any route. STABLE, ungranted; reached from clara.get_rent_settlement_candidates, clara._settle_rent_payable_core and the list_review_queue splice.';

create or replace function clara._rent_settlement_bank_candidates(
    p_client uuid, p_target_cents bigint, p_around date, p_window_days int default 10)
  returns jsonb
  language sql stable security definer set search_path = clara, pg_temp
  as $rsbc$
  select coalesce(jsonb_agg(jsonb_build_object(
      'line_id', l.id, 'statement_id', l.statement_id, 'bank_account_id', l.bank_account_id,
      'bank_account_display', ba.bank_name_display || ' ' || ba.account_number,
      'entry_date', l.entry_date, 'value_date', l.value_date, 'description', l.description,
      'amount_cents', l.amount_cents,
      'date_delta_days', (l.entry_date - p_around),
      'class_hint', clara._bank_line_class_hint(l.description))
      order by abs(l.entry_date - p_around), l.id), '[]'::jsonb)
  from clara.bank_statement_lines l
  join clara.bank_statements s on s.id = l.statement_id
  join clara.bank_accounts ba on ba.id = l.bank_account_id
  where l.client_id = p_client and s.status = 'live'
    and l.amount_cents = -p_target_cents
    and l.entry_date between (p_around - p_window_days) and (p_around + p_window_days)
    and not exists (select 1 from clara.bank_match_line_members m
        where m.line_id = l.id and m.group_status in ('pending', 'live'))
    and not coalesce((select (e.status = 'open' or e.resolution_disposition = 'bank_corrective_line')
        from clara.bank_line_exceptions e where e.line_id = l.id
        order by (e.status = 'open') desc, e.created_at desc, e.id desc
        limit 1), false);
$rsbc$;
revoke all on function clara._rent_settlement_bank_candidates(uuid,bigint,date,int) from public;

comment on function clara._rent_settlement_bank_candidates(uuid,bigint,date,int) is
  '#949 AC4: the deterministic match basis for one open month of rent -- live, unspent, unexcepted bank lines on this client whose signed amount is the EXACT negative of the target cents, within p_window_days of the month''s own posting date (default 10). Never a score, never a tolerance, never a ranking (#657''s own law, #947''s own body). STABLE, ungranted.';

create or replace function clara.get_rent_settlement_candidates(p_client uuid)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $grsc$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'entry_id', u.entry_id, 'plan_id', u.plan_id, 'document_id', u.document_id,
        'filing_id', u.filing_id, 'posting_date', u.posting_date,
        'period_month', u.period_month, 'payable_account_code', u.payable_account_code,
        'rent_cents', u.rent_cents, 'unsettled_cents', u.unsettled_cents,
        -- THIRTY-FIVE DAYS, AND THE ROW SAYS SO (fix round, finding ADV-11). Rent recognised on
        -- the 5th and paid on the 25th is an ordinary Malaysian tenancy and was 20 days outside
        -- the payroll lane's ten-day window -- so the read showed "the payment has not appeared"
        -- with an empty list for a line clara.settle_rent_payable would have taken (that door
        -- applies no date window at all). A month either side covers the ordinary case without
        -- starting to offer unrelated payments of a round number, and the window travels ON the
        -- row so a person is never told less than was searched.
        'candidate_window_days', 35,
        'candidates', clara._rent_settlement_bank_candidates(
          p_client, u.unsettled_cents, u.posting_date, 35))
      order by u.posting_date, u.entry_id)
    from clara._rent_payable_unsettled(p_client) u
    where u.unsettled_cents > 0
  ), '[]'::jsonb);
end $grsc$;

comment on function clara.get_rent_settlement_candidates(uuid) is
  '#949 AC4: per client, each month of rent whose payable is still open, with its own candidate bank lines -- searched 35 days either side of the month''s own posting date, and the window travels on the row (fix-round finding ADV-11). Derived entirely from live state; stores nothing. bookkeeper+, clara_authenticated only.';

revoke all on function clara.get_rent_settlement_candidates(uuid) from public;
grant execute on function clara.get_rent_settlement_candidates(uuid) to clara_authenticated;

create or replace function clara._settle_rent_payable_core(
    p_ctx jsonb, p_client uuid, p_entry uuid, p_line uuid, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  as $srpc$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_req bytea;
  u record; ln record; st record; v_bank uuid; v_coa text;
  v_entry uuid; v_receipt uuid; v_match jsonb; v_memo text;
  v_open_draft uuid; v_locked uuid;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the rent settle core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;

  v_req := clara._hash(jsonb_build_object('client', p_client, 'entry', p_entry, 'line', p_line));
  v_dedupe := clara._reserve_op(c.firm, 'settle_rent_payable', p_op_key, v_req);
  if v_dedupe is not null then return v_dedupe; end if;

  -- RESOLVE BEFORE YOU LOCK (fix round, finding ADV-10). A FOR UPDATE on a caller-supplied id
  -- taken before the row is proved to be this client's is a weak existence/activity oracle
  -- across the tenant wall: the call BLOCKS for an id another firm's open transaction holds and
  -- returns instantly for an id that does not exist. 0021's no-existence-oracle rule. So the
  -- row is resolved INSIDE this client and this firm first, and the lock is taken only on a row
  -- that survived that.
  --
  -- AND THE REFUSAL STAYS ONE REFUSAL. Deliberately NOT a raise here: an id that is not this
  -- client's entry, an id of another firm's entry and an id that is no entry at all must all
  -- come out of the SAME door below (not_an_open_rent_month), because three different answers
  -- to three different wrong ids is the oracle in another form. The door's named contract is
  -- unchanged; only the lock moved.
  select je.id into v_locked from clara.journal_entries je
   where je.id = p_entry and je.client_id = p_client and je.firm_id = c.firm;
  if v_locked is not null then
    -- LOCKS, in the estate's own order: the pre-existing rent entry first, then the client rung;
    -- the bank rows are locked LAST, one frame further in, by _match_bank_line_core itself.
    perform 1 from clara.journal_entries je where je.id = v_locked for update;
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  select * into u from clara._rent_payable_unsettled(p_client) x where x.entry_id = p_entry;
  if u.entry_id is null then
    raise exception 'journal entry % is not a month of rent on a confirmed rent plan''s payable account', p_entry
      using errcode='CLR10',detail='{"reason":"not_an_open_rent_month"}';
  end if;
  if u.unsettled_cents is null or u.unsettled_cents <= 0 then
    raise exception 'this month''s rent payable is already covered' using errcode='CLR10',
      detail='{"reason":"already_settled"}';
  end if;

  select * into ln from clara.bank_statement_lines l where l.id = p_line;
  if not found or ln.client_id <> p_client or ln.firm_id <> c.firm then
    raise exception 'statement line % is not in this client', p_line using errcode='CLR11';
  end if;
  select * into st from clara.bank_statements s where s.id = ln.statement_id;
  if not found or st.status <> 'live' then
    raise exception 'statement line % belongs to a % statement; only a live statement admits a settlement', p_line, coalesce(st.status,'(missing)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_period','line_id',p_line,
          'statement_status',st.status)::text;
  end if;
  if ln.amount_cents <> -u.unsettled_cents then
    raise exception 'statement line % (% cents) does not pay this month''s open rent (% cents)', p_line, ln.amount_cents, u.unsettled_cents
      using errcode='CLR10',
        detail=jsonb_build_object('reason','amount_mismatch','line_cents',ln.amount_cents,
          'unsettled_cents',u.unsettled_cents)::text;
  end if;
  if exists (select 1 from clara.bank_match_line_members mm join clara.bank_matches bm on bm.id=mm.match_id
             where mm.line_id = p_line and bm.status in ('pending','live')) then
    raise exception 'statement line % already rides a pending or live match; unmatch it first', p_line
      using errcode='CLR10',detail=jsonb_build_object('reason','already_matched','line_id',p_line)::text;
  end if;
  v_bank := st.bank_account_id;
  select ba.coa_account_code into v_coa from clara.bank_accounts ba
    where ba.id = v_bank and ba.firm_id = c.firm and ba.client_id = p_client and ba.active;
  if v_coa is null then
    raise exception 'this bank account has no active mapped GL account'
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;

  -- ONE SETTLEMENT DRAFT AT A TIME (fix round, beside ADV-04). The high-stakes arm below leaves
  -- a DRAFT behind for a distinct checker; a second accept of the same month would mint a second
  -- one and both could post.
  select je2.id into v_open_draft from clara.journal_entries je2
   where je2.client_id = p_client and je2.status = 'draft'
     and (je2.flags->'rent_settlement'->>'rent_entry_id') = p_entry::text
   order by je2.created_at, je2.id limit 1;
  if v_open_draft is not null then
    raise exception 'a settlement for this month''s rent is already drafted and waiting for a checker'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','settlement_awaiting_checker',
          'rent_entry_id', p_entry, 'settlement_entry_id', v_open_draft)::text;
  end if;

  v_memo := 'Rent settlement ' || to_char(u.period_month, 'FMMonth YYYY');

  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      maker_actor, last_human_editor, flags)
    values (p_client, 'draft', ln.entry_date, v_memo, 'manual', c.actor, c.actor,
      jsonb_build_object('rent_settlement', jsonb_build_object(
        'rent_entry_id', p_entry, 'plan_id', u.plan_id, 'document_id', u.document_id,
        'period_month', to_char(u.period_month,'YYYY-MM-DD'),
        'payable_account_code', u.payable_account_code)))
    returning id into v_entry;

  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
    values (v_entry, 1, u.payable_account_code, u.unsettled_cents, 0, v_memo);
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
    values (v_entry, 2, v_coa, 0, u.unsettled_cents, v_memo);
  perform clara._assert_balanced(v_entry);

  perform clara._append_event(c.firm, 'entry.drafted', p_client, c.actor, null, 'interactive',
    v_entry, null, null, '{}'::jsonb);

  -- THE HIGH-STAKES WALL (fix round, finding ADV-04), AT PARITY WITH THE ORDINARY DOOR, and for
  -- the SAME reason #947's twin carries it: clara._approve_entry_core refuses a maker's own
  -- approval of a high-stakes entry when the firm carries a second eligible checker, and demands
  -- a written attestation when it does not. Commercial rent at RM12,000 a month clears an
  -- ordinary firm's high-stakes floor, so without this wall one bookkeeper could post and approve
  -- it through /bank while the same entry booked by hand is refused. The estate's own answer to
  -- an in-body approval meeting a high-stakes entry is clara.reverse_entry's: LEAVE IT A DRAFT.
  -- Nothing is dark -- the entry exists, balanced, on the bank's own GL code, so a checker
  -- approves it through clara.approve_entry and binds it through the ordinary bank matcher; until
  -- then the month stays open BY THE LEDGER and keeps its Needs-you row.
  if clara.is_high_stakes(v_entry) then
    perform clara._audit(c.firm, c.actor, null, null, 'settle_rent_payable', v_entry,
      jsonb_build_object('client', p_client, 'rent_entry_id', p_entry, 'line_id', p_line,
        'settlement_entry_id', v_entry, 'unsettled_cents', u.unsettled_cents,
        'status', 'awaiting_checker', 'reason', 'high_stakes_needs_checker'));
    return clara._finish_op(c.firm, 'settle_rent_payable', p_op_key,
      jsonb_build_object('entry_id', v_entry, 'match_id', null,
        'unsettled_cents', u.unsettled_cents,
        'period_month', to_char(u.period_month,'YYYY-MM-DD'),
        'posting_date', to_char(ln.entry_date,'YYYY-MM-DD'),
        'status', 'awaiting_checker', 'reason', 'high_stakes_needs_checker',
        'eligible_checker_count', clara.eligible_checker_count(c.firm),
        'line_id', p_line));
  end if;

  update clara.journal_entries
     set status = 'approved', checker_actor = c.actor, approved_at = now(), updated_at = now()
   where id = v_entry;

  -- entry_post_receipts_gate_verdicts_check demands a non-blank gate_verdicts->>'extraction_id'
  -- on every via_wake_kind other than 'bank_agent' -- the estate's one shared proof that
  -- SOMETHING grounds a receipt. A settlement has no extraction; the rent entry it settles is
  -- the honest equivalent (what this act was ABOUT), carried again under its own name for a
  -- reader who would otherwise have to know the reuse. #947's own idiom, restated.
  v_receipt := gen_random_uuid();
  insert into clara.entry_post_receipts(id, firm_id, client_id, entry_id, acting_actor,
      on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
      maker_active_at_approval, op_key)
    values (v_receipt, c.firm, p_client, v_entry, c.actor, null, 'interactive',
      jsonb_build_object('provider','clara_db','model','tenancy_rent_settlement','version','v1'),
      'Accepted a settlement candidate: statement line ' || p_line
        || ' pays the rent payable recognised by entry ' || p_entry || '.',
      jsonb_build_object('extraction_id', p_entry::text, 'rent_entry_id', p_entry,
        'line_id', p_line, 'unsettled_cents', u.unsettled_cents,
        'payable_account_code', u.payable_account_code),
      'rent_settlement_interactive', true, p_op_key || ':post');

  perform clara._append_event(c.firm, 'entry.posted', p_client, c.actor, null, 'interactive',
    v_entry, null, null,
    jsonb_build_object('post_receipt_id', v_receipt, 'approval_arm', 'rent_settlement_interactive'));

  -- THROUGH AN EXISTING BANK-SIDE DOOR: the new entry now carries a leg on the bank's own GL
  -- code, so it is an ordinary, lawful candidate for match_bank_line's own core -- called
  -- directly (the ctx is threaded, the #655/#657/#947 idiom), never re-implemented.
  v_match := clara._match_bank_line_core(
    jsonb_build_object('actor', c.actor, 'firm', c.firm, 'is_agent', false),
    p_client, jsonb_build_array(p_line),
    jsonb_build_array(jsonb_build_object('entry_id', v_entry, 'matched_cents', -u.unsettled_cents)),
    null, false, p_op_key || ':match');

  perform clara._audit(c.firm, c.actor, null, null, 'settle_rent_payable', v_entry,
    jsonb_build_object('client', p_client, 'rent_entry_id', p_entry, 'line_id', p_line,
      'settlement_entry_id', v_entry, 'unsettled_cents', u.unsettled_cents,
      'match_id', v_match->>'match_id'));

  return clara._finish_op(c.firm, 'settle_rent_payable', p_op_key,
    jsonb_build_object('entry_id', v_entry, 'match_id', v_match->>'match_id',
      'unsettled_cents', u.unsettled_cents,
      'period_month', to_char(u.period_month,'YYYY-MM-DD'),
      'posting_date', to_char(ln.entry_date,'YYYY-MM-DD'),
      'status', 'settled'));
end $srpc$;

revoke all on function clara._settle_rent_payable_core(jsonb,uuid,uuid,uuid,text) from public;

comment on function clara._settle_rent_payable_core(jsonb,uuid,uuid,uuid,text) is
  '#949: books Dr <the plan''s own payable> / Cr <bank COA> for one month''s open rent, approves it directly (via_wake_kind=interactive), then reuses clara._match_bank_line_core to bind it to the chosen bank line. A HIGH-STAKES settlement is left a DRAFT instead (status=awaiting_checker, no receipt and no match), the clara.reverse_entry posture, so the ordinary approve door''s distinct-checker and self-attestation arms decide it -- fix-round finding ADV-04. Ungranted; reached from clara.settle_rent_payable alone.';

create or replace function clara.settle_rent_payable(p_client uuid, p_entry uuid, p_line uuid, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $srp$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._settle_rent_payable_core(
    jsonb_build_object('actor', c.actor, 'firm', c.firm, 'is_agent', false),
    p_client, p_entry, p_line, p_op_key);
end $srp$;

comment on function clara.settle_rent_payable(uuid,uuid,uuid,text) is
  '#949 AC4: accept one settlement candidate -- a month of rent''s own posted entry and the bank line that pays it. Returns status=settled, or status=awaiting_checker when the settlement entry is high-stakes: the entry is drafted and a distinct checker approves it through the ordinary door. bookkeeper+, clara_authenticated only.';

revoke all on function clara.settle_rent_payable(uuid,uuid,uuid,text) from public;
grant execute on function clara.settle_rent_payable(uuid,uuid,uuid,text) to clara_authenticated;

reset role;

set role clara_fn_owner;

-- =====================================================================================
-- §I  THE DEPOSIT (AC5) -- clara.get_tenancy_deposit_coding(p_client uuid).
--
--     "The deposit is recorded as a term and NEVER drafted, because signing does not say the
--     money moved; when a payment matching the deposit appears on the bank surface, the
--     deposits-paid account is the proposed coding." (the brief.) Both halves are here, and
--     nothing else is: there is NO write door in this section at all, deliberately. Coding a bank
--     line is the coding lane's own act, through the doors a person already uses; what this lane
--     owes is the OFFER -- the deposit it read, the line that could be it, and the account the
--     standard chart already ships for exactly this.
--
--     `1120 Deposits Paid` is consumed by code AND name from the published standard chart
--     (WAVE-4 LANE RULE (a)); this file inserts no chart row. A client who does not hold it is
--     TOLD so (`proposed_account_in_chart: false`) rather than offered a code their chart cannot
--     take -- the #948 discipline, applied to an offer instead of an entry.
--
--     THE WINDOW IS SIXTY DAYS, not the rent settlement's ten, and the reason is the thing being
--     matched: a month's rent is paid within days of the month it belongs to, while a deposit is
--     paid once, around commencement, and a tenancy signed on the 5th is routinely funded weeks
--     before or after. Sixty days either side of the term's first day is the honest span, and a
--     wider one would start offering unrelated payments of a round number.
--
--     `already_coded` IS A LEDGER READ, so the offer clears itself the moment the deposit is
--     coded -- by any route, with no dismissal act. CONTEXT.md's Settlement candidate row
--     discipline again, applied to a coding rather than a settlement.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
create or replace function clara.get_tenancy_deposit_coding(p_client uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $gtdc$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'document_id', d.document_id,
        'deposit_cents', d.deposit_cents,
        'printed_raw', d.printed_raw,
        'recorded_at', d.recorded_at,
        'basis_kind', d.basis_kind,
        'source_region_ids', d.source_region_ids,
        'term_start', to_char(d.term_start,'YYYY-MM-DD'),
        'proposed_account_code', '1120',
        'proposed_account_name', d.account_name,
        'proposed_account_in_chart', d.account_name is not null,
        'already_coded', d.allocated_cents >= d.deposit_cents,
        'coded_cents', d.allocated_cents,
        -- THE OFFER SAYS WHAT IT ALLOCATED, AND FROM WHAT (fix round, finding ADV-06). 1120
        -- Deposits Paid carries no subledger, so the only ledger fact available is the ACCOUNT's
        -- balance. The first cut compared that whole balance against EACH deposit on its own, so
        -- one coded deposit -- or an unrelated utility deposit booked to 1120 -- declared every
        -- other deposit already coded and withdrew the offer silently (DRIVEN in the review).
        -- The balance is now allocated oldest-deposit-first across the client's own recorded
        -- deposits, and both figures travel on the row so nobody has to guess which is which.
        'deposits_account_balance_cents', d.account_balance_cents,
        'coded_basis', 'account_balance_fifo',
        'deposits_sharing_account', d.deposit_count,
        'candidates', case when d.allocated_cents >= d.deposit_cents then '[]'::jsonb
          else clara._rent_settlement_bank_candidates(
                 p_client, d.deposit_cents,
                 coalesce(d.term_start, d.recorded_at::date), 60) end)
      order by d.recorded_at)
    from (
      select ct.document_id, ct.amount_cents as deposit_cents, ct.printed_raw, ct.recorded_at,
             ct.basis_kind, to_jsonb(ct.source_region_ids) as source_region_ids,
             (select s.term_date from clara.contract_terms s
               where s.document_id = ct.document_id and s.term_key = 'term_start'
                 and s.superseded_at is null) as term_start,
             (select a.name from clara.coa_accounts a
               where a.client_id = p_client and a.account_code = '1120' and a.is_active) as account_name,
             b.account_balance_cents,
             count(*) over () as deposit_count,
             -- THIS deposit's own FIFO share of the account balance: whatever is left after every
             -- OLDER recorded deposit has taken its share first.
             greatest(0, least(ct.amount_cents,
               b.account_balance_cents
                 - (sum(ct.amount_cents) over (order by ct.recorded_at, ct.id
                      rows between unbounded preceding and current row) - ct.amount_cents)
             )) as allocated_cents
        from clara.contract_terms ct
        cross join lateral (
          select coalesce((select sum(jl.debit_cents) - coalesce(sum(jl.credit_cents),0)
                             from clara.journal_lines jl
                             join clara.journal_entries je on je.id = jl.entry_id
                            where jl.account_code = '1120' and je.client_id = p_client
                              and je.status = 'approved' and je.reversed_by is null
                              and je.reversal_of is null), 0) as account_balance_cents) b
       where ct.client_id = p_client and ct.term_key = 'deposit' and ct.superseded_at is null
         and ct.amount_cents > 0
    ) d
  ), '[]'::jsonb);
end $gtdc$;

comment on function clara.get_tenancy_deposit_coding(uuid) is
  '#949 AC5: per client, every recorded tenancy deposit with the bank lines that could be it and 1120 Deposits Paid as the proposed coding -- an OFFER, never a posting: this lane has no write door for a deposit at all, because signing does not say the money moved. 1120 carries no subledger, so the account balance is allocated oldest-deposit-first across the client''s own recorded deposits and BOTH figures travel on the row (fix-round finding ADV-06). Derived entirely from live state, so it clears itself the moment the deposit is coded by any route. bookkeeper+, clara_authenticated only.';

revoke all on function clara.get_tenancy_deposit_coding(uuid) from public;
grant execute on function clara.get_tenancy_deposit_coding(uuid) to clara_authenticated;

reset role;

set role clara_fn_owner;

-- =====================================================================================
-- §J  THE ESCALATION (AC6) -- clara._tenancy_escalation_state(uuid),
--     clara.get_tenancy_escalation_revision(uuid) and
--     clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text).
--
--     "A stated escalation surfaces under Needs you BEFORE its effective date and offers a plan
--     revision a person confirms; no amount changes without that confirmation." (the brief.)
--
--     THE STATE IS DERIVED, like everything else in this lane: a live rent plan, a live
--     `escalation` contract term, and a live revision whose credit does NOT yet carry the
--     escalated amount. When the plan already charges the escalated rent the row is gone --
--     `already_revised` -- with nothing to dismiss and nothing to clean up.
--
--     "BEFORE ITS EFFECTIVE DATE" IS SIXTY DAYS, and the number is a product choice stated out
--     loud rather than a constant hidden in a body: a rent review needs enough notice for an
--     accountant to decide the treatment and, where the increase is stepped, to decide whether
--     the straight-line question changes anything. Beyond that it is next year's question and
--     `not_due_yet` says so. The row does NOT disappear once the date passes -- an escalation
--     that took effect and was never confirmed is exactly the case a person most needs to see.
--
--     THE REVISION IS THE PLAN LANE'S OWN ACT. `clara.revise_accounting_plan` is called, not
--     re-implemented, so the authority floor, the alignment wall, the op-key reservation and the
--     client rung all apply unchanged. What this door adds is the SECOND confirmation row
--     (`kind='rent_plan_revision'`), which is what makes "no amount changes without that
--     confirmation" a record and not a promise.
--
--     AND IT ASKS, because a stepped rent always makes the lessee branch ask: straight-line means
--     the total rent averaged over the term, so the monthly expense differs from the month's cash
--     rent unless the increases only follow expected general inflation. That is the same wall the
--     first confirmation carries, for the same reason, and the message is the branch's own
--     question.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
create or replace function clara._tenancy_escalation_state(p_document uuid)
  returns jsonb language plpgsql stable set search_path = clara, pg_temp as $tes$
declare
  v_plan record; v_esc jsonb; v_from date; v_new bigint; v_cur bigint;
  v_rev record; v_today date; v_days int; v_lead int := 60;
begin
  select * into v_plan from clara._tenancy_rent_plan(p_document);
  if v_plan.plan_id is null then
    return jsonb_build_object('pending', false, 'reason', 'no_confirmed_plan',
      'document_id', p_document);
  end if;

  select ct.escalation into v_esc from clara.contract_terms ct
   where ct.document_id = p_document and ct.term_key = 'escalation' and ct.superseded_at is null;
  if v_esc is null then
    return jsonb_build_object('pending', false, 'reason', 'no_escalation_recorded',
      'document_id', p_document, 'plan_id', v_plan.plan_id);
  end if;

  v_from := nullif(btrim(coalesce(v_esc->>'effective_from','')),'')::date;
  v_new := nullif(btrim(coalesce(v_esc->>'new_amount_cents','')),'')::bigint;

  select r.revision, r.frequency, r.day_rule, r.day_of_month, r.timezone,
         r.effective_from, r.effective_to, r.basis
    into v_rev
    from clara.accounting_plan_revisions r
   where r.plan_id = v_plan.plan_id and r.superseded_at is null;
  select max((l->>'credit_cents')::bigint) into v_cur
    from jsonb_array_elements(coalesce(v_rev.basis->'lines','[]'::jsonb)) l
   where (l->>'credit_cents')::bigint > 0;

  if v_cur = v_new then
    return jsonb_build_object('pending', false, 'reason', 'already_revised',
      'document_id', p_document, 'plan_id', v_plan.plan_id,
      'current_cents', v_cur, 'new_cents', v_new,
      'effective_from', to_char(v_from,'YYYY-MM-DD'));
  end if;

  -- THE HOUSE LEGAL DATE, FROM ITS ONE OWNER (fix round, finding SPEC-10).
  v_today := clara._book_today();
  v_days := v_from - v_today;
  if v_from is not null and v_days > v_lead then
    return jsonb_build_object('pending', false, 'reason', 'not_due_yet',
      'document_id', p_document, 'plan_id', v_plan.plan_id,
      'current_cents', v_cur, 'new_cents', v_new, 'days_until', v_days,
      'effective_from', to_char(v_from,'YYYY-MM-DD'), 'lead_days', v_lead);
  end if;

  return jsonb_build_object('pending', true, 'reason', null,
    'document_id', p_document, 'plan_id', v_plan.plan_id,
    'client_id', v_plan.client_id, 'confirmation_id', v_plan.confirmation_id,
    'current_cents', v_cur, 'new_cents', v_new, 'days_until', v_days,
    'effective_from', to_char(v_from,'YYYY-MM-DD'), 'lead_days', v_lead,
    'printed_raw', v_esc->>'printed_raw',
    'payable_account_code', v_plan.payable_account_code,
    'rent_account_code', v_plan.rent_account_code,
    'proposed_revision', jsonb_build_object(
      'frequency', v_rev.frequency, 'day_rule', v_rev.day_rule,
      'day_of_month', v_rev.day_of_month, 'timezone', v_rev.timezone,
      'effective_from', to_char(greatest(v_from, v_rev.effective_from),'YYYY-MM-DD'),
      'effective_to', to_char(v_rev.effective_to,'YYYY-MM-DD'),
      'basis', jsonb_build_object(
        'posting_date', to_char(greatest(v_from, v_rev.effective_from),'YYYY-MM-DD'),
        'memo', v_rev.basis->>'memo', 'currency', 'MYR',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', v_plan.rent_account_code,
            'debit_cents', v_new, 'credit_cents', 0, 'description', v_rev.basis->>'memo'),
          jsonb_build_object('account_code', v_plan.payable_account_code,
            'debit_cents', 0, 'credit_cents', v_new, 'description', v_rev.basis->>'memo')))));
end $tes$;
revoke all on function clara._tenancy_escalation_state(uuid) from public;

comment on function clara._tenancy_escalation_state(uuid) is
  '#949 AC6: whether this tenancy''s recorded escalation is still owed a plan revision, and the revision it would take. DERIVED from the live plan revision and the live escalation term, so it clears itself the moment the plan carries the escalated amount -- by any route, with no dismissal act. Sixty days'' notice, and it does NOT disappear once the date passes. Ungranted.';

create or replace function clara.get_tenancy_escalation_revision(p_document uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $gter$
declare c record; v_client uuid;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select f.client_id into v_client from clara.document_filings f
   where f.document_id = p_document and f.firm_id = c.firm and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_client is null then
    raise exception 'document % is not a live filing in your firm', p_document using errcode='CLR11';
  end if;
  return clara._tenancy_escalation_state(p_document);
end $gter$;

comment on function clara.get_tenancy_escalation_revision(uuid) is
  '#949 AC6: the plan revision a recorded escalation is asking for, before its effective date -- the current and escalated rent, the date, and the revision a person would confirm. Derived entirely from live state; writes nothing. viewer+, clara_authenticated only.';

revoke all on function clara.get_tenancy_escalation_revision(uuid) from public;
grant execute on function clara.get_tenancy_escalation_revision(uuid) to clara_authenticated;

create or replace function clara.confirm_tenancy_rent_plan_revision(p_client uuid, p_document uuid,
    p_judgement text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  as $ctrpr$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_state jsonb; v_tr jsonb; v_rev jsonb;
  v_judgement text; v_confirmation uuid; v_plan record; v_result jsonb;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'revising a rent plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if not exists (select 1 from clara.document_filings f
                  where f.document_id = p_document and f.client_id = p_client
                    and f.firm_id = c.firm and f.retired_at is null) then
    raise exception 'document % is not a live filing of this client', p_document using errcode='CLR11';
  end if;

  v_judgement := nullif(btrim(coalesce(p_judgement,'')),'');

  v_dedupe := clara._reserve_op(c.firm, 'confirm_tenancy_rent_plan_revision', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'document', p_document,
      'judgement', v_judgement)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_state := clara._tenancy_escalation_state(p_document);
  if (v_state->>'pending')::boolean is not true then
    raise exception 'there is no escalation to confirm on this tenancy (%)', coalesce(v_state->>'reason','none')
      using errcode='CLR10',
        detail=jsonb_build_object('reason', coalesce(v_state->>'reason','no_escalation_recorded'),
          'plan_id', v_state->>'plan_id')::text;
  end if;

  v_tr := clara._tenancy_lease_treatment(p_client, p_document);
  -- A STEPPED RENT ALWAYS ASKS, so this wall is reached on every ordinary escalation. It is the
  -- same wall the first confirmation carries and it quotes the same body's own question.
  if (v_tr->>'drafts')::boolean is not true and v_judgement is null then
    raise exception '%', v_tr->>'question'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','professional_judgement_required',
          'treatment_reason', v_tr->>'reason', 'standard', v_tr->>'standard')::text;
  end if;

  select * into v_plan from clara._tenancy_rent_plan(p_document);
  v_rev := v_state->'proposed_revision';

  v_confirmation := gen_random_uuid();
  insert into clara.contract_plan_confirmations(id, firm_id, client_id, document_id, kind,
      monthly_rent_cents, rent_account_code, payable_account_code, term_start, term_end,
      treatment, professional_judgement, confirmed_by)
    values (v_confirmation, c.firm, p_client, p_document, 'rent_plan_revision',
      (v_state->>'new_cents')::bigint,
      v_plan.rent_account_code, v_plan.payable_account_code,
      (v_rev->>'effective_from')::date, v_plan.term_end,
      v_tr, v_judgement, c.actor);

  -- THE PLAN LANE'S OWN DOOR, called rather than re-implemented.
  v_result := clara.revise_accounting_plan(
    p_plan => v_plan.plan_id,
    p_frequency => v_rev->>'frequency',
    p_day_rule => v_rev->>'day_rule',
    p_day_of_month => nullif(v_rev->>'day_of_month','')::int,
    p_timezone => v_rev->>'timezone',
    p_effective_from => (v_rev->>'effective_from')::date,
    p_effective_to => (v_rev->>'effective_to')::date,
    p_basis => v_rev->'basis',
    p_reversal_day_rule => null,
    p_op_key => p_op_key || ':revise');

  perform clara._audit(c.firm, c.actor, null, null, 'confirm_tenancy_rent_plan_revision', null,
    jsonb_build_object('client', p_client, 'document', p_document,
      'confirmation', v_confirmation, 'plan', v_plan.plan_id,
      'revision', v_result->>'revision',
      'from_cents', v_state->>'current_cents', 'to_cents', v_state->>'new_cents',
      'judgement_given', v_judgement is not null));

  return clara._finish_op(c.firm, 'confirm_tenancy_rent_plan_revision', p_op_key,
    jsonb_build_object('document_id', p_document, 'client_id', p_client,
      'confirmation_id', v_confirmation,
      'plan_id', v_plan.plan_id, 'revision', (v_result->>'revision')::int,
      'revision_id', v_result->>'revision_id',
      'from_cents', (v_state->>'current_cents')::bigint,
      'to_cents', (v_state->>'new_cents')::bigint,
      'effective_from', v_rev->>'effective_from',
      'treatment', v_tr, 'professional_judgement', v_judgement));
end $ctrpr$;

comment on function clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text) is
  '#949 AC6: a named person confirms the plan revision a recorded escalation asks for. The act is recorded as a second clara.contract_plan_confirmations row (kind=rent_plan_revision) and the schedule is moved through clara.revise_accounting_plan, so no amount ever changes without a record of who changed it. A stepped rent always makes the lessee branch ask, so a written professional judgement is required and the refusal quotes the branch''s own question. bookkeeper+, clara_authenticated only.';

revoke all on function clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text) from public;
grant execute on function clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text) to clara_authenticated;

reset role;

set role clara_fn_owner;

-- =====================================================================================
-- §K  NEEDS YOU -- clara.list_review_queue gains TWO row kinds (AC4's arm and AC6's arm).
--
--     SPLICED, NEVER RE-TYPED, additive -- the 0146/0168/0180/0260/0288/0297/0298/0299 idiom.
--     Both rows are DERIVED and both clear themselves:
--       rent_payable_unsettled  -- from clara._rent_payable_unsettled's FIFO ledger read, so it
--                                  goes the moment the payable is covered by ANY route (this
--                                  lane's own accept door, a hand-booked cheque, or that entry
--                                  reconciled through the ordinary bank matcher). "Rent is
--                                  posted, the payment has not appeared" is the brief's own
--                                  sentence and it is the sentence on the row.
--       rent_escalation_pending -- from clara._tenancy_escalation_state, so it goes the moment
--                                  the plan's live revision carries the escalated amount.
--     Neither mints a dismissal act, a marker or a counts.* key, and neither adds a json key --
--     both reuse the EXISTING row shape unchanged, so the two db-side FULL_ROW_KEYS rosters stay
--     byte-unchanged.
--
--     TWO KINDS IN ONE TICKET is one more than this wave's lane rule contemplates, and it is
--     deliberate: AC4 and AC6 are two different questions a person answers differently (one
--     accepts a settlement candidate, the other confirms a plan revision), and folding them into
--     one kind would make the label, the link and the affordance all have to guess which. Both
--     are appended CONTIGUOUSLY at the end of the roster, in one hunk, so the edit stays as
--     additive as a single kind would have been.
--
--     `id`/`entry_id` carry the RENT ENTRY for the settlement row (there is no ambiguity to point
--     at) and the PLAN for the escalation row; `document_id` carries the tenancy in both, so
--     every row links back to the agreement a person would open.
-- =====================================================================================
do $p949_lrq$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_next text; v_code text; v_anchor text; v_repl text;
  v_n int; v_raw_n int; v_pre_cols int; v_post_cols int;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  if position('rent_payable_unsettled' in v_code) <> 0 then
    raise notice '#949 SecK: the queue already projects rent_payable_unsettled -- splice already applied, nothing to do (redo)';
  else
    if v_pre_sha <> 'bc7f9250bf58562e893dee83623d4e2abc6bc42480bfd69f65944a76f893ed6e' then
      raise exception '#949 SecK prestate: clara.list_review_queue is not at its pinned post-#948 body (sha %) -- re-derive this splice against the live body', v_pre_sha
        using errcode='CLR10';
    end if;

    v_pre_cols := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
                  / length('null::int open_proposal_count');

    v_anchor :=
      '    union all select * from payroll_settlement_rows' || chr(10) ||
      '    union all select * from agreement_rows' || chr(10) ||
      '  ), keyed as (';
    v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
    v_raw_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 or v_raw_n <> v_n then
      raise exception '#949 SecK prestate: the all_rows union tail appears % time(s) IN CODE / % in RAW text (expected 1/1) -- re-derive this splice against the LIVE body', v_n, v_raw_n
        using errcode='CLR10';
    end if;

    v_repl := $p949u$    union all select * from payroll_settlement_rows
    union all select * from agreement_rows
    union all select * from rent_settlement_rows
    union all select * from rent_escalation_rows
  ), keyed as ($p949u$;
    v_next := replace(v_def, v_anchor, v_repl);
    if position('union all select * from rent_settlement_rows' in v_next) = 0
       or position('union all select * from rent_escalation_rows' in v_next) = 0 then
      raise exception '#949 SecK splice: the all_rows anchor did not rewrite' using errcode='CLR10';
    end if;
    if v_next = v_def then
      raise exception '#949 SecK splice: no byte moved -- refusing a no-op apply' using errcode='CLR10';
    end if;

    -- The two new CTEs are inserted immediately before the (now-rewritten) `), all_rows as (`
    -- boundary, so they land beside their siblings rather than at the top of the body.
    v_anchor := '  ), all_rows as (' || chr(10) || '    select * from draft_rows union all select * from filing_rows';
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#949 SecK prestate: the all_rows opener appears % time(s), expected 1', v_n
        using errcode='CLR10';
    end if;
    v_repl := $p949c$  ), rent_settlement_rows as (
    -- #949 (0300): A MONTH OF RENT WHOSE PAYMENT HAS NOT APPEARED. DERIVED from
    -- clara._rent_payable_unsettled's own FIFO ledger read over the confirmed rent plan's
    -- payable account -- stores nothing, clears itself the moment the account's own balance says
    -- the month is covered, by whichever route covered it (CONTEXT.md's Settlement candidate
    -- row, #657's own shape, #947's own second instance). Section `needs_you`, lane `needs_you`.
    -- `id`/`entry_id` carry the rent entry itself; `document_id` carries the tenancy.
    select 2 section_rank,'rent_payable_unsettled'::text row_kind,'needs_you'::text section,
      active_rent_client.id client_id,null::uuid counterparty_id,rpu.filing_id,rpu.entry_id,
      null::uuid question_id,null::uuid task_id,rpu.document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,rpu.posting_date aged_since,
      rpu.unsettled_cents amount_cents,to_char(rpu.period_month,'YYYY-MM-DD') period,
      'Rent is posted for ' || to_char(rpu.period_month,'FMMonth YYYY')
        || '; the payment has not appeared.' question_text,
      rpu.posting_date created_at,rpu.entry_id id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.clients active_rent_client
    cross join lateral clara._rent_payable_unsettled(active_rent_client.id) rpu
    where active_rent_client.firm_id=c.firm and active_rent_client.status='active'
      and (v_client is null or active_rent_client.id=v_client)
      and rpu.unsettled_cents > 0
  ), rent_escalation_rows as (
    -- #949 (0300): A STATED RENT REVIEW THE PLAN HAS NOT TAKEN YET. DERIVED from
    -- clara._tenancy_escalation_state: a live rent plan, a live escalation term, and a live
    -- revision that does not yet carry the escalated amount. It appears sixty days before the
    -- date and does NOT disappear once the date passes -- an escalation that took effect and was
    -- never confirmed is exactly the case a person most needs to see. `id`/`task_id` carry the
    -- plan; `document_id` carries the tenancy.
    select 2 section_rank,'rent_escalation_pending'::text row_kind,'needs_you'::text section,
      esc_client.id client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,(es.state->>'plan_id')::uuid task_id,es.document_id,
      'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,(es.state->>'effective_from')::date aged_since,
      (es.state->>'new_cents')::bigint amount_cents,es.state->>'effective_from' period,
      'This tenancy states a rent escalation from '
        || to_char((es.state->>'effective_from')::date,'FMDD FMMonth YYYY')
        || '; the plan still charges the earlier amount. Confirm the revision, or decide another treatment.' question_text,
      (es.state->>'effective_from')::date created_at,(es.state->>'plan_id')::uuid id,
      ''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.clients esc_client
    cross join lateral (
      select distinct cf.document_id from clara.contract_plan_confirmations cf
       where cf.client_id = esc_client.id and cf.kind = 'rent_plan') cfd
    cross join lateral (select clara._tenancy_escalation_state(cfd.document_id) state,
                               cfd.document_id document_id) es
    where esc_client.firm_id=c.firm and esc_client.status='active'
      and (v_client is null or esc_client.id=v_client)
      and (es.state->>'pending')::boolean is true
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows$p949c$;
    v_next := replace(v_next, v_anchor, v_repl);
    if position('rent_settlement_rows as (' in v_next) = 0
       or position('rent_escalation_rows as (' in v_next) = 0 then
      raise exception '#949 SecK splice: the CTE-insertion anchor did not rewrite' using errcode='CLR10';
    end if;

    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#949 SecK postcheck: list_review_queue changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode='CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#949 SecK postcheck: the definition did not change -- the splice was a no-op'
        using errcode='CLR10';
    end if;

    -- ADDITIVE, PROVEN: the shared column vector appears exactly TWO more times than it did.
    v_post_cols := (length((select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure))
                    - length(replace((select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure), 'null::int open_proposal_count', '')))
                   / length('null::int open_proposal_count');
    if v_post_cols <> v_pre_cols + 2 then
      raise exception '#949 SecK postcheck: the shared column vector appears % time(s), expected % (two more than before the splice)', v_post_cols, v_pre_cols + 2
        using errcode='CLR10';
    end if;

    raise notice '#949 SecK: clara.list_review_queue spliced -- two CTEs (rent_settlement_rows and rent_escalation_rows, both needs_you/needs_you, active-client-guarded, both derived) and two union arms; owner (%) and ACL byte-unchanged. definition sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;
end
$p949_lrq$;

reset role;

-- =====================================================================================
-- No rig-meta cohort would be a wrong claim here: this file adds TEN newly-GRANTED, CALLABLE
-- names, every one of them clara_authenticated and none of them reachable by any machine lane.
-- All ten are added to packages/db/tests/rig-meta.mjs's ALLOWED roster and to their own
-- operation-census cohort in the SAME commit, so operation-census.test.mjs is the actual
-- grant-correctness proof and is run as one of this ticket's gates. The twelve internals this
-- file mints are reached only from definer bodies already accounted for above and are covered by
-- that same sweep's default "no role may execute anything unlisted" posture, with no cohort entry
-- of their own needed (the #946/#947 posture, restated).
-- =====================================================================================

-- =====================================================================================
-- SecZ  TAIL. Everything this file claims to have done, re-derived from the live catalog.
--
--       IT READS `p.prosrc`, NEVER A RENDERED DEFINITION, and that is a lint contract rather
--       than a style choice: scripts/wiki-lint-checks.mjs classifies any `do` block that so much
--       as NAMES the definition-rendering catalog function as a change-of-record PATCH site and
--       then requires every attributable target to sit in the wiki whitelist. #948 measured that
--       in both directions; this tail therefore names it nowhere at all, comments included.
-- =====================================================================================
do $p949_tail$
declare
  v_owner text; v_vol text; v_secdef boolean; v_n int; v_sig text; v_src text;
  v_proacl aclitem[]; v_proowner oid; v_rls boolean; v_force boolean; v_j jsonb;
begin
  -- T.1 THE TWO NEW RELATIONS: forced RLS, owned by clara_fn_owner, their TWO policies each
  --     (owner and human -- the agent lane holds no grant and no policy, fix-round finding
  --     SPEC-08), their append-only belts and the live-uniqueness index the chain rests on.
  for v_sig in select unnest(array['contract_terms','contract_plan_confirmations']) loop
    select c.relrowsecurity, c.relforcerowsecurity, c.relowner::regrole::text
      into v_rls, v_force, v_owner
      from pg_class c where c.oid = ('clara.' || v_sig)::regclass;
    if not v_rls or not v_force or v_owner <> 'clara_fn_owner' then
      raise exception '#949 tail T.1: clara.% is rls=% force=% owner=% -- expected true/true/clara_fn_owner', v_sig, v_rls, v_force, v_owner
        using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_policies p
     where p.schemaname = 'clara' and p.tablename = v_sig;
    if v_n <> 2 then
      raise exception '#949 tail T.1: clara.% carries % policy(ies), expected 2 (owner, human)', v_sig, v_n
        using errcode='CLR10';
    end if;
    -- THE AGENT WALL, GRANT-LEVEL (fix round, finding SPEC-08). rig-runtime-visibility.test.mjs
    -- sweeps every new table for exactly this; asserted in-migration too so a future recut of
    -- this file cannot restore the grant without colliding here first.
    if has_table_privilege('clara_agent_ro', 'clara.' || v_sig, 'SELECT') then
      raise exception '#949 tail T.1: clara_agent_ro can SELECT clara.% -- the agent lane has ZERO access to a new table unless it has no door, and this lane has doors', v_sig
        using errcode='CLR10';
    end if;
    if exists (select 1 from pg_policies p
                where p.schemaname = 'clara' and p.tablename = v_sig
                  and p.policyname like '%@_agent' escape '@') then
      raise exception '#949 tail T.1: clara.% still carries an agent policy with no grant behind it', v_sig
        using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_trigger t
     where t.tgrelid = ('clara.' || v_sig)::regclass and not t.tgisinternal;
    if v_n <> 2 then
      raise exception '#949 tail T.1: clara.% carries % non-internal trigger(s), expected 2 (the append-only belt and the truncate belt)', v_sig, v_n
        using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_indexes i
                  where i.schemaname='clara' and i.tablename='contract_terms'
                    and i.indexname='uq_contract_terms_live') then
    raise exception '#949 tail T.1: uq_contract_terms_live is absent -- two live readings of one term could coexist'
      using errcode='CLR10';
  end if;

  -- T.2 THE TEN GRANTED DOORS carry EXACTLY clara_authenticated: not PUBLIC (grantee 0), and no
  --     machine lane. Read off pg_proc.proacl directly, never a privilege predicate.
  for v_sig in select unnest(array[
      'clara.record_contract_terms(uuid,uuid,jsonb,text)',
      'clara.get_contract_terms(uuid)',
      'clara.propose_contract_terms(uuid)',
      'clara.get_tenancy_rent_plan_draft(uuid)',
      'clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text)',
      'clara.get_rent_settlement_candidates(uuid)',
      'clara.settle_rent_payable(uuid,uuid,uuid,text)',
      'clara.get_tenancy_deposit_coding(uuid)',
      'clara.get_tenancy_escalation_revision(uuid)',
      'clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text)'])
  loop
    select p.proacl, p.proowner, p.proowner::regrole::text, p.prosecdef
      into v_proacl, v_proowner, v_owner, v_secdef
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_owner <> 'clara_fn_owner' or not v_secdef then
      raise exception '#949 tail T.2: % is owner=% secdef=% -- expected clara_fn_owner / true', v_sig, v_owner, v_secdef
        using errcode='CLR10';
    end if;
    if exists (select 1 from aclexplode(coalesce(v_proacl, acldefault('f', v_proowner))) a
                where a.grantee = 0) then
      raise exception '#949 tail T.2: PUBLIC holds a grant on %', v_sig using errcode='CLR10';
    end if;
    if not exists (select 1 from aclexplode(coalesce(v_proacl, acldefault('f', v_proowner))) a
                    where a.grantee = 'clara_authenticated'::regrole) then
      raise exception '#949 tail T.2: clara_authenticated lacks a grant on %', v_sig using errcode='CLR10';
    end if;
    if exists (select 1 from aclexplode(coalesce(v_proacl, acldefault('f', v_proowner))) a
                where a.grantee in ('clara_runtime'::regrole, 'clara_agent_ro'::regrole)) then
      raise exception '#949 tail T.2: a machine-lane role holds a grant on %, expected clara_authenticated only', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- T.3 THE TWELVE INTERNALS hold NO application role's grant at all -- only the owner.
  for v_sig in select unnest(array[
      'clara._contract_terms_row_json(clara.contract_terms)',
      'clara._contract_term_rank(text)',
      'clara._tenancy_term_regions(uuid)',
      'clara._client_reporting_framework(uuid)',
      'clara._tenancy_lease_treatment(uuid,uuid)',
      'clara._tenancy_account_is_bank(uuid,text)',
      'clara._tenancy_rent_plan_draft(uuid,uuid,text,text)',
      'clara._tenancy_rent_plan(uuid)',
      'clara._rent_payable_unsettled(uuid)',
      'clara._rent_settlement_bank_candidates(uuid,bigint,date,int)',
      'clara._settle_rent_payable_core(jsonb,uuid,uuid,uuid,text)',
      'clara._tenancy_escalation_state(uuid)'])
  loop
    select p.proacl, p.proowner into v_proacl, v_proowner from pg_proc p where p.oid = v_sig::regprocedure;
    if exists (select 1 from aclexplode(coalesce(v_proacl, acldefault('f', v_proowner))) a
                where a.grantee <> v_proowner) then
      raise exception '#949 tail T.3: % is reachable by an application role -- expected wholly ungranted', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- T.4 THE QUEUE SPLICE: both new kinds projected exactly once, and every kind that was there
  --     before this file survives at its own marker.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
  for v_sig in select unnest(array['rent_payable_unsettled','rent_escalation_pending']) loop
    v_n := (length(v_src) - length(replace(v_src, '''' || v_sig || '''::text row_kind', '')))
           / length('''' || v_sig || '''::text row_kind');
    if v_n <> 1 then
      raise exception '#949 tail T.4: the queue projects % % time(s), expected 1', v_sig, v_n
        using errcode='CLR10';
    end if;
  end loop;
  for v_sig in select unnest(array['draft','uncoded_filing','open_question','coding_task',
      'compliance_watch','lint_finding','fixed_asset_incomplete','staff_advance_incomplete',
      'work_question','depreciation_authority_pending','payroll_posting_blocked',
      'payroll_net_pay_unsettled','agreement_posting_blocked'])
  loop
    if position('''' || v_sig || '''::text row_kind' in v_src) = 0 then
      raise exception '#949 tail T.4: the queue no longer projects % -- an earlier lane''s arm was disturbed', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  if position('union all select * from rent_settlement_rows' in v_src) = 0
     or position('union all select * from rent_escalation_rows' in v_src) = 0 then
    raise exception '#949 tail T.4: the all_rows union no longer includes both new arms' using errcode='CLR10';
  end if;

  -- T.5 THE TWO AUTHORITY SPLICES: the third kind is admitted in both bodies, and both arms #977
  --     shipped survive verbatim.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._authority_ref_refusal(text,uuid,uuid,uuid)'::regprocedure;
  if position('contract_confirmation' in v_src) = 0
     or position('if p_ref_kind = ''accounting_work'' then' in v_src) = 0
     or position('if p_ref_kind = ''chat_task'' then' in v_src) = 0
     or position('authority_ref_not_human_instruction' in v_src) = 0 then
    raise exception '#949 tail T.5: clara._authority_ref_refusal is missing the new arm or one of #977''s own'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)'::regprocedure;
  if position('''contract_confirmation'')' in v_src) = 0
     or position('authority_rule_unsupported' in v_src) = 0
     or position('plan_kind_unsupported' in v_src) = 0
     or position('clara._authority_ref_refusal(v_ref_kind, v_ref_id, v_firm, p_client)' in v_src) = 0 then
    raise exception '#949 tail T.5: clara.create_accounting_plan lost a wall it carried before this file'
      using errcode='CLR10';
  end if;

  -- T.6 THE CHART IS CONSUMED, NEVER APPENDED TO. The three codes are still the current published
  --     platform template's, under the names this file spells; and STRUCTURALLY, no body this
  --     file mints names the template table at all, so it could not append a row if it wanted to.
  for v_sig, v_src in
    select x.code, x.nm from (values ('2050','Rent Payable'),('6100','Rental of Premises'),
                                     ('1120','Deposits Paid')) x(code, nm)
  loop
    if not exists (
      select 1 from clara.coa_template_accounts a
        join clara.coa_templates t on t.id = a.template_id
       where t.template_key = 'my_sme_starter' and t.scope = 'platform' and t.state = 'published'
         and t.version = (select max(t2.version) from clara.coa_templates t2
                            where t2.template_key='my_sme_starter' and t2.scope='platform'
                              and t2.state='published')
         and a.account_code = v_sig and a.name = v_src) then
      raise exception '#949 tail T.6: the current published platform template no longer carries % %', v_sig, v_src
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and (p.proname like 'contract@_%' escape '@' or p.proname like '%tenancy%'
          or p.proname like '%rent_%' or p.proname like '%_contract_term%')
     and (p.prosrc ilike '%coa_template_accounts%' or p.prosrc ilike '%document_service_periods%');
  if v_n <> 0 then
    raise exception '#949 tail T.6: % of this lane''s bodies name the chart template or the prepayment service period -- this file appends no chart row and weakens no person-stated term', v_n
      using errcode='CLR10';
  end if;

  -- T.7 A FIXTURE-FREE PROBE over the bodies that can be driven without a client: the closed
  --     term-key roster, the bank test over an account nobody holds, the framework read over a
  --     client that does not exist, and the lessee branch over nothing at all -- which must say
  --     `terms_incomplete` rather than assuming a framework or a rent.
  if clara._contract_term_rank('monthly_rent') <> 1 or clara._contract_term_rank('deposit') <> 2
     or clara._contract_term_rank('term_start') <> 3 or clara._contract_term_rank('term_end') <> 4
     or clara._contract_term_rank('escalation') <> 5
     or clara._contract_term_rank('service_charge') <> 9 then
    raise exception '#949 tail T.7: the contract-term vocabulary is not the closed five-member roster this file ships'
      using errcode='CLR10';
  end if;
  if clara._tenancy_account_is_bank('00000000-0000-0000-0000-000000000000'::uuid, '2050') then
    raise exception '#949 tail T.7: the bank test says 2050 is a bank account for a client that does not exist'
      using errcode='CLR10';
  end if;
  v_j := clara._client_reporting_framework('00000000-0000-0000-0000-000000000000'::uuid);
  if (v_j->>'in_force') <> 'none' or (v_j->>'framework_code') is not null then
    raise exception '#949 tail T.7: the framework read invented an answer for a client that does not exist (%)', v_j
      using errcode='CLR10';
  end if;
  v_j := clara._tenancy_lease_treatment('00000000-0000-0000-0000-000000000000'::uuid,
                                        '00000000-0000-0000-0000-000000000000'::uuid);
  if (v_j->>'drafts')::boolean is not false or (v_j->>'reason') <> 'terms_incomplete'
     or position('MPERS Section 20' in coalesce(v_j->>'basis','')) = 0
     or position('MFRS 16' in coalesce(v_j->>'basis','')) = 0 then
    raise exception '#949 tail T.7: the lessee branch does not refuse an unrecorded tenancy, or its written basis no longer names both standards (%)', v_j
      using errcode='CLR10';
  end if;

  -- T.8 (fix round) THE FIVE WALLS THIS ROUND ADDED, re-read off the CATALOG so a later recut
  --     that drops one collides here.
  --       ADV-02  a reversal mirror is neither a month of rent nor a payment
  --       ADV-03  one row per LIVE PLAN, and the confirm door refuses a shared payable account
  --       ADV-04  the settlement core probes clara.is_high_stakes before it approves
  --       ADV-05  the MPERS arm asks the finance-vs-operating classification
  --       SPEC-10 the legal business date comes from clara._book_today(), nowhere else
  select regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\s+',' ','g') into v_src
    from pg_proc p where p.oid='clara._rent_payable_unsettled(uuid)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, 'je.reversal_of is null', '')))
         / length('je.reversal_of is null');
  if v_n <> 2 then
    raise exception '#949 tail T.8: the rent read excludes a reversal mirror on % side(s), expected 2 (credits and debits) -- ADV-02''s wall is gone', v_n
      using errcode='CLR10';
  end if;
  if position('distinct on (cf.payable_account_code)' in v_src) <> 0 then
    raise exception '#949 tail T.8: the rent read is keyed on the payable ACCOUNT again -- two tenancies sharing one account would collapse into the newest (ADV-03)'
      using errcode='CLR10';
  end if;
  select regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\s+',' ','g') into v_src
    from pg_proc p where p.oid='clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text)'::regprocedure;
  if position('payable_account_in_use' in v_src) = 0 then
    raise exception '#949 tail T.8: the confirm door no longer refuses a payable account another live rent plan uses (ADV-03)'
      using errcode='CLR10';
  end if;
  select regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\s+',' ','g') into v_src
    from pg_proc p where p.oid='clara._settle_rent_payable_core(jsonb,uuid,uuid,uuid,text)'::regprocedure;
  if position('clara.is_high_stakes(v_entry)' in v_src) = 0
     or position('high_stakes_needs_checker' in v_src) = 0
     or position('settlement_awaiting_checker' in v_src) = 0 then
    raise exception '#949 tail T.8: the rent settlement core no longer probes clara.is_high_stakes before approving, or no longer refuses a second draft (ADV-04)'
      using errcode='CLR10';
  end if;
  select regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\s+',' ','g') into v_src
    from pg_proc p where p.oid='clara._tenancy_lease_treatment(uuid,uuid)'::regprocedure;
  if position('mpers_lease_classification' in v_src) = 0 then
    raise exception '#949 tail T.8: the MPERS arm no longer asks for the finance-vs-operating classification (ADV-05)'
      using errcode='CLR10';
  end if;
  for v_sig in select unnest(array['clara._client_reporting_framework(uuid)',
                                   'clara._tenancy_escalation_state(uuid)']) loop
    select regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\s+',' ','g') into v_src
      from pg_proc p where p.oid = v_sig::regprocedure;
    if position('clara._book_today()' in v_src) = 0 or v_src ilike '%Asia/Kuala_Lumpur%' then
      raise exception '#949 tail T.8: % still owns a copy of the house legal date instead of calling clara._book_today() (SPEC-10)', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#949 tail OK: clara.contract_terms and clara.contract_plan_confirmations are forced-RLS, clara_fn_owner-owned, two policies and two belts each with no agent-lane grant at all, with the live-uniqueness index the supersede chain rests on; the ten granted doors are clara_authenticated-only with no PUBLIC and no machine lane, and the twelve internals are reachable by no application role; clara.list_review_queue projects rent_payable_unsettled and rent_escalation_pending exactly once each beside all thirteen kinds it already carried; clara._authority_ref_refusal and clara.create_accounting_plan admit contract_confirmation while keeping every wall #977 and #640 put there; the three chart rows this lane consumes are still the current published platform template''s under the names it spells, and no body of this lane names the template table or the prepayment service period at all; a fixture-free probe drove the closed term vocabulary, the bank test, the framework read and the lessee branch -- which refuses an unrecorded tenancy by name and still states MPERS Section 20 and MFRS 16 in its written basis; and the five fix-round walls are live (no reversal mirror in either half of the rent FIFO, one row per live plan, a refused shared payable account, a high-stakes settlement left a draft, an MPERS classification question, and the legal date owned only by clara._book_today()).';
end
$p949_tail$;
