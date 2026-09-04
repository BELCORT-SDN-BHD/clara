-- =====================================================================================
-- DB-A / 1 of 7 -- clara.document_kind_codeability: WHICH DOCUMENT KINDS OWE A JOURNAL
-- ENTRY, AS DATA RATHER THAN AS A LITERAL.
--
-- APPLY ORDER: this file is the FIRST of the DB-A set. dba2 (the two document close gates)
-- and dba4 (the two coding-lane population readers) all call clara._is_codeable_kind, which
-- is born here. Number the seven files in this file order at merge.
--
-- WHY A TABLE AND NOT AN ARRAY LITERAL (H-12 / H-53, handover 2026-09-04). Three readers
-- need the same answer -- clara._close_gate_uncoded, clara._close_gate_undated and the two
-- coding-lane population readers -- and the answer is an ACCOUNTING JUDGEMENT, not an
-- engineering fact: it is the owner's to change, and changing it must not need a
-- migration. A literal array repeated in four bodies is the closed-enumeration mistake this
-- estate has already paid for twice (the 0154 role census, #525's derived roster): a
-- twenty-first document kind added to documents_document_kind_check would silently inherit
-- whichever default the literal happened to carry, in four places, with nothing to say so.
--
-- THE UNKNOWN-KIND DIRECTION IS DELIBERATE AND IT IS "STILL WORK". Both a NULL kind (not yet
-- classified) and a kind this table does not name (a future twenty-first) read CODEABLE.
-- Getting this backwards is the expensive direction: a gate that hides a filing it does not
-- recognise false-PASSES a close, silently. A gate that shows one it should not is visible,
-- attestable (uncoded_documents is drawer 2) and costs a person one look. The DRIFT GUARD in
-- this file's tail, and its rig cell, make the unknown case LOUD rather than merely safe.
--
-- THE SEED IS DERIVED, NOT TYPED. The kind roster comes out of
-- documents_document_kind_check's own live definition (0123:2054-2061, twenty values), and
-- the tail refuses if the table's roster and the constraint's roster are not the same set.
-- =====================================================================================

-- Precautionary, not load-bearing: this file writes twenty rows and creates two objects.
-- The bound exists so a genuinely stuck concurrent DDL session fails loudly rather than
-- hanging the deploy.
set local statement_timeout = '5min';
set local lock_timeout = '5s';

-- =====================================================================================
-- PRESTATE -- every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $dba1_pre$
declare
  v_def text;
  v_n int;
  v_kinds text[];
begin
  if not exists (select 1 from pg_roles where rolname = 'clara_fn_owner') then
    raise exception 'dba1 prestate: role clara_fn_owner is missing' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'clara_authenticated') then
    raise exception 'dba1 prestate: role clara_authenticated is missing' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'clara_agent_ro') then
    raise exception 'dba1 prestate: role clara_agent_ro is missing' using errcode = 'CLR10';
  end if;

  -- (a) IDEMPOTENCY. Neither object may already exist -- this file is not a re-apply.
  if to_regclass('clara.document_kind_codeability') is not null then
    raise exception 'dba1 prestate: clara.document_kind_codeability already exists -- this file has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._is_codeable_kind(text)') is not null then
    raise exception 'dba1 prestate: clara._is_codeable_kind already exists -- this file has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._document_kind_roster()') is not null then
    raise exception 'dba1 prestate: clara._document_kind_roster already exists -- this file has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (b) THE VOCABULARY THIS FILE SEEDS FROM IS THE ONE IT WAS WRITTEN AGAINST. Read the
  -- CHECK's live definition and count its values; a roster that has moved means the seed
  -- below is incomplete and must be re-derived by a human, not silently applied.
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'documents'
     and con.contype = 'c' and con.conname = 'documents_document_kind_check';
  if v_def is null then
    raise exception 'dba1 prestate: documents_document_kind_check is absent -- the kind vocabulary this file derives from does not exist'
      using errcode = 'CLR10';
  end if;
  -- Derived INLINE here, by the same recipe S0's function uses, because the function does
  -- not exist yet at prestate time. S0's tail then re-derives through the function itself,
  -- so the two derivations are proven to agree before this file commits.
  select coalesce(array_agg(distinct m[1] order by m[1]), array[]::text[]) into v_kinds
    from regexp_matches(v_def, '''([a-z_]+)''::text', 'g') m;
  v_n := coalesce(array_length(v_kinds, 1), 0);
  if v_n <> 20 then
    raise exception 'dba1 prestate: documents_document_kind_check names % kind(s), expected the 20-value 0123 form -- the vocabulary moved and this file''s seed must be re-derived (def: %)', v_n, v_def
      using errcode = 'CLR10';
  end if;
  raise notice 'dba1 prestate: clean -- documents_document_kind_check carries % kinds; neither the table nor the helper exists yet.', v_n;
end $dba1_pre$;

-- =====================================================================================
-- S0 -- clara._document_kind_roster() : THE DERIVED ROSTER.
--
-- The roster is READ OUT OF THE CATALOG, never typed. Everything downstream -- this file's
-- prestate, its seed, its drift guard and the rig cell -- reads the SAME function, so the
-- three can never disagree about what the vocabulary is. It parses the CHECK's rendered
-- definition, which for the 0123 form is
--     CHECK (document_kind IS NULL OR document_kind = ANY (ARRAY['invoice'::text, ...]))
-- and pulls every single-quoted literal out of it.
--
-- IMMUTABLE would be a lie (it reads pg_constraint); STABLE is the truth.
-- =====================================================================================
set role clara_fn_owner;

create function clara._document_kind_roster() returns text[]
  language sql stable security definer set search_path = clara, pg_catalog, pg_temp as $fn$
  select coalesce(array_agg(distinct m[1] order by m[1]), array[]::text[])
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral regexp_matches(pg_get_constraintdef(con.oid), '''([a-z_]+)''::text', 'g') m
   where n.nspname = 'clara' and c.relname = 'documents'
     and con.contype = 'c' and con.conname = 'documents_document_kind_check';
$fn$;
revoke all on function clara._document_kind_roster() from public;
alter function clara._document_kind_roster() owner to clara_fn_owner;
comment on function clara._document_kind_roster() is
  'The document-kind vocabulary DERIVED from documents_document_kind_check''s live definition, never typed. clara.document_kind_codeability''s totality guard reads this, so the guard cannot go stale against a widened CHECK -- it goes LOUD instead (DB-A, 2026-09-04).';

reset role;

-- =====================================================================================
-- S1 -- clara.document_kind_codeability : THE TABLE.
--
-- FIRM-LESS BY CONSTRUCTION. Whether an invoice owes a journal entry is not a property of a
-- tenant; it is a property of double-entry bookkeeping. The 0153 sst_rate_schedule posture is
-- the precedent for a firm-independent reference table in this schema: forced RLS with an
-- owner policy, and grants named one at a time rather than assumed.
--
-- `basis` IS NOT DECORATION. It is the sentence a professional reads when the gate does or
-- does not name their document, and it is what makes a row the owner flips an informed
-- change rather than a guess. NOT NULL, non-blank, enforced.
-- =====================================================================================
set role clara_fn_owner;

create table clara.document_kind_codeability (
  kind        text        primary key check (btrim(kind) <> ''),
  codeable    boolean     not null,
  basis       text        not null check (btrim(basis) <> ''),
  recorded_at timestamptz not null default now()
);

comment on table clara.document_kind_codeability is
  'Which document kinds carry a monetary transaction that owes a journal entry. Read by clara._is_codeable_kind, and through it by the two close gates (uncoded_documents, undated_documents) and the two coding-lane population readers. THE OWNER CHANGES A ROW HERE INSTEAD OF SHIPPING A MIGRATION -- this is an accounting judgement, and the whole reason it is data (H-12/H-53, handover 2026-09-04).';
comment on column clara.document_kind_codeability.codeable is
  'TRUE = a filed document of this kind with no live journal entry is OUTSTANDING WORK and the close gate says so. FALSE = the kind never carries an entry, so its absence is not a finding. A kind ABSENT from this table reads TRUE (still work) -- the visible direction, not the silent one.';
comment on column clara.document_kind_codeability.basis is
  'Why, in one sentence a professional can argue with. Never blank.';

alter table clara.document_kind_codeability enable row level security;
alter table clara.document_kind_codeability force row level security;

-- The owner policy. Forced RLS applies to the table owner too, so without this the DEFINER
-- helper below -- which runs AS clara_fn_owner -- would read zero rows and every kind would
-- silently read "still work". That failure would be safe-directioned but wrong, so it is
-- walled here rather than trusted.
create policy p_document_kind_codeability_owner on clara.document_kind_codeability
  for all to clara_fn_owner using (true) with check (true);

-- The scoped human read. There is no firm to scope BY -- the whole table is one global
-- vocabulary with no tenant column and nothing tenant-derived in it -- so the predicate is
-- `true` and the honesty lives in the SELECT-only verb and the absent write grant, not in a
-- firm predicate that would be theatre. The web renders this mapping so a professional can
-- see why their document is or is not in the lane.
create policy p_document_kind_codeability_read on clara.document_kind_codeability
  for select to clara_authenticated using (true);

reset role;

grant select on clara.document_kind_codeability to clara_authenticated;

-- =====================================================================================
-- S2 -- THE SEED. Twenty rows, one per live kind.
--
-- THE DIRECTION OF THE ERROR IS THE WHOLE ARGUMENT, so it is written down: uncoded_documents
-- is a DRAWER-2 gate, which means a FALSE FAIL is a speed bump with an audit trail
-- (attest_close_exception) while a FALSE PASS is a year closed over an unposted bill and
-- nobody ever asked again -- the date scope makes that miss permanent. So every genuinely
-- arguable kind is seeded CODEABLE.
-- =====================================================================================
insert into clara.document_kind_codeability(kind, codeable, basis) values
  -- ---------------------------------------------------------------- CODEABLE (10 of 20)
  ('invoice', true,
   'A sales or purchase invoice is the primary source document for a revenue or expense entry. If it is filed and dated in the year, the books owe an entry for it.'),
  ('receipt', true,
   'A receipt evidences a payment made or received, or a cash sale. It posts.'),
  ('credit_note', true,
   'A credit note reduces or reverses an invoice. It posts, and a missing one overstates revenue or expense.'),
  ('debit_note', true,
   'A debit note adds a charge to a counterparty. It posts.'),
  ('payment_voucher', true,
   'A payment voucher authorises and evidences a disbursement. It posts against the payable or the expense it settles.'),
  ('claim_form', true,
   'An employee expense claim becomes an expense and a payable to the claimant. It posts.'),
  ('payroll_summary', true,
   'Payroll posts wages, EPF, SOCSO, EIS and PCB. A filed payroll summary with no entry is a month of unposted staff cost.'),
  ('e_invoice_xml', true,
   'The MyInvois XML IS an invoice, in machine form. Same obligation as the paper it replaces.'),
  ('handwritten_note', true,
   'ARGUABLE, SEEDED THE VISIBLE WAY. In Malaysian SME practice a handwritten slip is often a real bill or receipt from a small vendor. Treated as work until a person says otherwise, because the alternative hides a genuine unposted cost.'),
  ('other', true,
   'Classified, but into no kind at all. That is not evidence the document owes nothing -- it is an unanswered question, and the lane is where unanswered questions belong.'),
  -- ------------------------------------------------------------ NOT CODEABLE (10 of 20)
  ('bank_statement', false,
   'A statement is reconciliation evidence, not a transaction. Its LINES post through the bank-reconciliation lane against their own matched entries; the statement document itself never carries one. This kind is also the sharpest instance of the defect: ingest_bank_statement stamps documents.financial_date = period_end UNCONDITIONALLY (0038:1846), so before this table every filed statement landed inside the fiscal year and failed uncoded_documents permanently for that year.'),
  ('consent_evidence', false,
   'Egress consent evidence. 0014 makes it structurally exempt from facts extraction and set_document_kind refuses the kind outright (0123:1990, CLR28), so no entry will ever exist for it. Leaving it in the lane asked a professional for work that cannot be done.'),
  ('ssm_company_doc', false,
   'A statutory registry document -- constitution, Form 24/44/49, a company search. It records who the company is, not what it transacted.'),
  ('agreement_contract', false,
   'A contract creates an obligation, not a transaction. The invoices raised under it post; the contract itself does not, and booking from it would anticipate revenue or cost that has not been earned or incurred.'),
  ('identity_document', false,
   'KYC identity evidence -- an IC, a passport, a directors'' register extract. No monetary content of any kind.'),
  ('knowledge_artifact', false,
   'A firm knowledge note or working paper. Reference material, not a source document.'),
  ('tax_correspondence', false,
   'LHDN and RMCD letters, acknowledgements, reminders and EA forms are correspondence. THE ARGUABLE ONE, AND THE FIRST ROW TO REVISIT: a Notice of Assessment does create a liability that must be booked, and if the notice is the only document filed for it this row hides that from the gate. Seeded FALSE because the overwhelming majority of this kind is acknowledgement traffic that would otherwise block every close; flip it if the firm files assessments here.'),
  ('management_account', false,
   'A management report is DERIVED from the books. Posting from it would double-count the entries it was produced from.'),
  ('opening_balance_doc', false,
   'Opening balances enter through the governed opening-seed door (approve_opening_seed), under its own approval and its own continuity tie. They are never an ordinary journal entry hung off a filing.'),
  ('prior_gl', false,
   'A prior general ledger is migration input, consumed by the opening and migration path. Journalising it as a filing would re-post the entire previous book.');

-- =====================================================================================
-- S3 -- clara._is_codeable_kind(text) : THE ONE PREDICATE.
--
-- STABLE, not IMMUTABLE: it reads a table whose whole purpose is that the owner can change
-- it. Marking it IMMUTABLE would license the planner to fold a stale answer into an index or
-- a cached plan, which is exactly the drift this table exists to make impossible.
--
-- SECURITY DEFINER because two of its four callers are SECURITY INVOKER readers running
-- under clara_authenticated and clara_agent_ro (clara.list_uncoded_filings), and the
-- alternative -- granting those roles SELECT on the table and admitting them through RLS --
-- widens the table's read surface for no gain. The definer posture leaks nothing
-- tenant-scoped: every row here is global vocabulary.
-- =====================================================================================
set role clara_fn_owner;

create function clara._is_codeable_kind(p_kind text) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $fn$
  -- BOTH unknowns read TRUE, and they are DIFFERENT unknowns:
  --   NULL           -- not yet classified. It is work: somebody must say what it is.
  --   not in the table -- a kind the vocabulary gained and this table has not been told
  --                    about. It is work UNTIL SOMEBODY RULES, and the drift guard makes
  --                    the omission loud so "until somebody rules" is short.
  select case when p_kind is null then true
              else coalesce((select k.codeable
                               from clara.document_kind_codeability k
                              where k.kind = p_kind), true)
         end;
$fn$;
revoke all on function clara._is_codeable_kind(text) from public;
alter function clara._is_codeable_kind(text) owner to clara_fn_owner;
comment on function clara._is_codeable_kind(text) is
  'TRUE when a document of this kind can carry a journal entry, so a filed one without an entry is outstanding work. NULL and any kind absent from clara.document_kind_codeability both read TRUE -- the visible direction. The single definition behind clara._close_gate_uncoded, clara._close_gate_undated, clara.list_uncoded_filings and clara.list_review_queue''s filing rows (DB-A, 2026-09-04).';

reset role;

-- clara.list_uncoded_filings is SECURITY INVOKER and is executable by clara_authenticated
-- and clara_agent_ro (0011:4074-4082); a predicate it calls must be executable by the same
-- two roles or the reader 42501s the moment the conjunct lands. The wake lanes are NOT
-- granted -- they reach the reader through their own admitted wrappers, never directly.
grant execute on function clara._is_codeable_kind(text) to clara_authenticated, clara_agent_ro;

-- =====================================================================================
-- TAIL CENSUS -- re-read the live catalog and say what is actually there.
-- =====================================================================================
do $dba1_tail$
declare
  v_roster text[];
  v_seeded text[];
  v_missing text[];
  v_extra text[];
  v_n int; v_true int; v_false int;
  v_pol int; v_forced boolean; v_enabled boolean;
  v_probe boolean;
begin
  -- (1) TOTALITY, BOTH DIRECTIONS. The drift guard: a kind the CHECK admits and the table
  -- does not name, or a row naming a kind the CHECK no longer admits. Either is a FAIL.
  v_roster := clara._document_kind_roster();
  select array_agg(kind order by kind) into v_seeded from clara.document_kind_codeability;
  select array_agg(k order by k) into v_missing from unnest(v_roster) k
    where not exists (select 1 from clara.document_kind_codeability d where d.kind = k);
  select array_agg(d.kind order by d.kind) into v_extra from clara.document_kind_codeability d
    where not (d.kind = any (v_roster));
  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'dba1 tail: documents_document_kind_check admits kind(s) % that clara.document_kind_codeability does not name -- the roster is not total', v_missing
      using errcode = 'CLR10';
  end if;
  if coalesce(array_length(v_extra, 1), 0) > 0 then
    raise exception 'dba1 tail: clara.document_kind_codeability names kind(s) % the vocabulary does not admit', v_extra
      using errcode = 'CLR10';
  end if;

  select count(*)::int, count(*) filter (where codeable)::int, count(*) filter (where not codeable)::int
    into v_n, v_true, v_false from clara.document_kind_codeability;
  if v_n <> 20 then
    raise exception 'dba1 tail: expected 20 seeded kinds, found %', v_n using errcode = 'CLR10';
  end if;

  -- (2) THE FOUR KINDS THE HANDOVER NAMED BY HAND, asserted individually. A count of 10/10
  -- would be satisfied by the wrong ten.
  if clara._is_codeable_kind('bank_statement') then
    raise exception 'dba1 tail: bank_statement reads CODEABLE -- H-12''s headline defect is not fixed' using errcode = 'CLR10';
  end if;
  if clara._is_codeable_kind('consent_evidence') then
    raise exception 'dba1 tail: consent_evidence reads CODEABLE -- H-53''s headline defect is not fixed' using errcode = 'CLR10';
  end if;
  if not clara._is_codeable_kind('invoice') then
    raise exception 'dba1 tail: invoice reads NOT codeable -- the predicate is inverted' using errcode = 'CLR10';
  end if;
  -- (3) THE TWO UNKNOWNS both read TRUE. The `zzz_not_a_kind` probe is the one that matters:
  -- it is the twenty-first kind, arriving before anybody ruled on it.
  if not clara._is_codeable_kind(null) then
    raise exception 'dba1 tail: a NULL kind reads NOT codeable -- an unclassified document would be hidden from the lane' using errcode = 'CLR10';
  end if;
  select clara._is_codeable_kind('zzz_not_a_kind_' || gen_random_uuid()::text) into v_probe;
  if not v_probe then
    raise exception 'dba1 tail: an UNKNOWN kind reads NOT codeable -- a future twenty-first kind would be silently hidden' using errcode = 'CLR10';
  end if;

  -- (4) RLS, read from the catalog and not from this file's own text.
  select c.relrowsecurity, c.relforcerowsecurity into v_enabled, v_forced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'document_kind_codeability';
  if not v_enabled or not v_forced then
    raise exception 'dba1 tail: clara.document_kind_codeability RLS enabled=% forced=% -- both must be true', v_enabled, v_forced
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_pol from pg_policies
   where schemaname = 'clara' and tablename = 'document_kind_codeability';
  if v_pol <> 2 then
    raise exception 'dba1 tail: expected exactly 2 policies (owner + authenticated read), found %', v_pol
      using errcode = 'CLR10';
  end if;

  -- (5) NO WRITE REACHES A NON-OWNER. A read table that a human role can UPDATE is a
  -- different table than the one this file documented.
  if pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_kind_codeability', 'INSERT')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_kind_codeability', 'UPDATE')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_kind_codeability', 'DELETE') then
    raise exception 'dba1 tail: clara_authenticated holds a WRITE privilege on the codeability table' using errcode = 'CLR10';
  end if;
  if not pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_kind_codeability', 'SELECT') then
    raise exception 'dba1 tail: clara_authenticated cannot SELECT the codeability table -- the web read this file promised is absent' using errcode = 'CLR10';
  end if;
  if pg_catalog.has_table_privilege('clara_agent_ro', 'clara.document_kind_codeability', 'SELECT') then
    raise exception 'dba1 tail: clara_agent_ro holds a direct SELECT on the codeability table -- it must reach the vocabulary only through the DEFINER predicate' using errcode = 'CLR10';
  end if;

  raise notice 'dba1 tail: OK -- clara.document_kind_codeability holds % rows (% codeable / % not), TOTAL over documents_document_kind_check''s % derived kinds in BOTH directions. RLS enabled+forced with exactly % policies (owner ALL + clara_authenticated SELECT); clara_authenticated holds SELECT and no write; clara_agent_ro holds NO table privilege and reaches the vocabulary only through clara._is_codeable_kind. The predicate reads bank_statement=false, consent_evidence=false, invoice=true, NULL=true and an unseen kind=true. clara._document_kind_roster() derives the vocabulary from the CHECK so the guard cannot go stale silently. No table in workflow/graphile_worker/spike touched.',
    v_n, v_true, v_false, coalesce(array_length(v_roster, 1), 0), v_pol;
end $dba1_tail$;
