-- =====================================================================================
-- #624 -- THE DOCUMENT CAPABILITY REGISTRY, PERSISTED FACT VALIDATION, AND A CANONICAL
-- field_path GRAMMAR AT THE ONE UNVALIDATED WRITE BOUNDARY.
--
-- WHAT THIS FILE IS FOR, in the professional's words. Today Clara's answer to "can you read
-- this file?" is scattered across four places that have never been read together: the intake
-- lane map (packages/runtime/lib/intake-lanes.mjs), the admission allowlist
-- (packages/runtime/lib/intake.mjs), the facts router (clara._enqueue_invoice_facts_core) and
-- the coding judgement (clara.document_kind_codeability, 0165). A professional looking at a
-- filed document could therefore be shown "extraction: done" and infer that Clara understood
-- it, when in truth the router had already terminated the pair with `skipped_kind` and nothing
-- would ever be read from it. This file publishes the four answers as DATA, one row per
-- (format, kind), so the surfaces can state them independently and honestly.
--
-- THE FOUR AXES ARE INDEPENDENT AND THAT IS THE POINT (#624 acceptance 1 and 4):
--   custody           -- the bytes are sealed, hashed and retrievable.
--   byte_extraction   -- an intake-time reader turned the bytes into stored extraction content.
--   typed_facts       -- a facts lane can persist TYPED facts with source regions for this pair.
--   business_operation-- the pair can drive an accounting operation (a journal entry, a bank
--                        reconciliation, the governed opening-seed door).
-- A pair may be `supported` on the first two and `stored_only` on the last two; that is the
-- ordinary case for most of the twenty kinds, and saying so plainly is the whole deliverable.
--
-- THE FOUR LEVELS, defined once so a reader never has to guess:
--   'supported'    -- Clara does this today, and a test proves it.
--   'stored_only'  -- the document is kept and readable, and Clara deliberately derives nothing
--                     further. The lane TERMINATES cleanly (skipped_kind / skipped_type), or the
--                     work is a person's to do. This is the honest "no placeholder success".
--   'unsupported'  -- Clara cannot do this for this pair, and a reader that ran would fail.
--   'planned'      -- an accepted target that is not built. Used by NO level column today; the
--                     one deferred capability in this slice (invoice LINE ITEMS) is recorded in
--                     the machine-readable `limits` column instead, because line items are a
--                     GRANULARITY of the invoice facts row, not a (format, kind) pair of their
--                     own. See the `limits` comment below.
--
-- GLOBAL, NOT PER-FIRM -- the 0165 precedent exactly. Whether Clara can read an OFX file is a
-- property of Clara's code, not of a tenant. Forced RLS, an owner policy, a SELECT-only policy
-- for the two application read lanes, and no write grant to any application role.
--
-- ONE MONOTONE registry_version. Every row published together carries the same integer, so a
-- surface can say WHICH registry it rendered and a later file can publish version 2 wholesale.
--
-- #631 NOTE, recorded here rather than enforced in code: `typed_facts='supported'` NEVER
-- overrides an inactive egress purpose. The consent gates in clara._enqueue_invoice_facts_core
-- and clara.persist_document_extraction remain the authority over whether a read may happen at
-- all; this registry states only what Clara COULD do for a consented client. A surface that
-- read this table as permission would be reading the wrong instrument.
--
-- THE OFX FINDING (C-37 -- "no support promise from a filename alone"), measured 2026-09-13
-- and the reason the ofx x bank_statement row is not 'supported':
--   * A reader DOES exist: packages/runtime/lib/statement-parse.mjs's `parseStatementOfx`
--     reads OFX 1.x SGML and 2.x XML as a tag stream and returns the same
--     {header, lines, receipt} shape the CSV reader does.
--   * But OFX carries NO opening balance -- the format has no such field -- so
--     `parseStatementOfx` sets `opening_cents: null` BY CONSTRUCTION, and deriving it would
--     make the chain check tautological (the parser's own header says so).
--   * `statement-corroboration.mjs`'s `missingHeaderFields` counts `opening_cents` as a
--     required header field on BOTH verdict paths, so `corroborateChain` raises
--     `header_unreadable` on every OFX statement, and `statementFacts.v1.behavior.mjs`'s
--     structured lane has no continuity fill ahead of it.
--   * Measured directly (node, against a synthetic BANKTRANLIST with a LEDGERBAL):
--     preflightRead -> {code: header_unreadable, missing_fields: [institution_code,
--     opening_cents]}; corroborateChain -> the same refusal.
--   So OFX is honestly: custody supported, byte_extraction stored_only (intake takes the
--   store-only lane deliberately), typed_facts UNSUPPORTED. The intake hint on the web surface
--   is corrected in the same change so a filename never implies a promise.
--
-- THE field_path GRAMMAR IS CENSUSED, NOT INVENTED (C33.4). The in-repo producers emit numeric
-- segments (`pages.1.lines.0`, `rows.0`, `paragraphs.0`) and MIXED-CASE spreadsheet cell refs
-- (`sheets.0.A1`), so a lowercase-only grammar would have refused the hot OCR and XLSX ingest
-- paths on the first real upload. The accepted shape is stated in clara._assert_field_path's own
-- comment, and the tail probe below runs every censused producer path through it.
--
-- THE XLSX PRODUCER MEETS THIS GRAMMAR HALFWAY, and it had to. The `r=` attribute of an XLSX
-- `<c>` element is whatever the workbook says it is -- `A1:B1` on a merged range, `$A$1` from a
-- hand edit, an entity-escaped or wholly junk value -- and NONE of those is a legal field_path.
-- Interpolating it verbatim (which is what structured-worker.mjs did before this cohort) would
-- have made the validator below refuse the whole persist with CLR10, roll the transaction back
-- and leave the task `running`, so the lane would retry the same workbook until its attempt cap
-- burned. packages/runtime/lib/structured-worker.mjs therefore CLAMPS `r=` to an A1 reference
-- (`^[A-Za-z]{1,3}[0-9]{1,7}$`) at the point the path is born, and falls back to `cell_<ordinal>`
-- -- a shape an A1 reference can never take, so the fallback cannot collide with a declared ref
-- in the same sheet. The raw attribute is kept in the region's locator, so nothing is lost.
-- Pinned by packages/runtime/tests/structured-worker-cell-ref.test.mjs.
--
-- RISK, STATED. Section S6 replaces the LIVE body of clara.persist_document_extraction, which
-- sits on the hot ingest path. It uses the 0177 ceremony: a pre-image sha256 pin, a
-- single-anchor splice of pg_get_functiondef's own rendering, and an owner/ACL/DEFINER
-- post-check. APPLY DURING THE REPOSITORY'S REQUIRED WRITER-QUIESCENCE WINDOW for function-body
-- replacement. A validator can turn silent acceptance into refusal for a live engine path this
-- repository does not know about, so the PRESTATE below refuses the cutover outright if ANY
-- field_path already stored in clara.document_regions would fail the new grammar -- the
-- migration goes loud at apply rather than the ingest lane going dark afterwards. The
-- release-time read-only census is packages/db/deploy/0191-field-path-census.sql.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- PRESTATE -- every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $dcr_pre$
declare
  v_src text;
  v_def text;
  v_kinds text[];
  v_n int;
  v_bad text[];
begin
  -- clara_runtime is in this list because the TAIL sweeps its privileges on both new tables;
  -- has_table_privilege() on a role that does not exist raises a confusing catalog error three
  -- hundred lines later instead of a named one here.
  foreach v_def in array array['clara_fn_owner','clara_authenticated','clara_agent_ro','clara_runtime'] loop
    if not exists (select 1 from pg_roles where rolname = v_def) then
      raise exception 'dcr prestate: role % is missing', v_def using errcode = 'CLR10';
    end if;
  end loop;
  v_def := null;

  -- (a) IDEMPOTENCY. This file is not a re-apply.
  if to_regclass('clara.document_capabilities') is not null
     or to_regclass('clara.document_fact_validations') is not null
     or to_regprocedure('clara._document_capability(text,text)') is not null
     or to_regprocedure('clara._document_format(text)') is not null
     or to_regprocedure('clara._assert_field_path(text)') is not null
     or to_regprocedure('clara.get_document_state(uuid,uuid)') is not null then
    raise exception 'dcr prestate: an object this file creates already exists -- it has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (b) THE VOCABULARY THIS FILE SEEDS FROM is the one it was written against. Derived through
  -- 0165's own function so the seed, the guard and the rig cell can never disagree.
  if to_regprocedure('clara._document_kind_roster()') is null
     or to_regprocedure('clara._is_codeable_kind(text)') is null then
    raise exception 'dcr prestate: 0165''s kind roster / codeability predicate is absent -- this file derives from both'
      using errcode = 'CLR10';
  end if;
  v_kinds := clara._document_kind_roster();
  v_n := coalesce(array_length(v_kinds, 1), 0);
  if v_n <> 20 then
    raise exception 'dcr prestate: documents_document_kind_check names % kind(s), expected the 20-value live form -- the vocabulary moved and this file''s seed rules must be re-derived', v_n
      using errcode = 'CLR10';
  end if;

  -- (c) THE BODY THIS FILE RECUTS is the one it was written against.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'dcr prestate: clara.persist_document_extraction is absent' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <>
      '8ba95a5210ad839d510729baebff3863862b6073691bf6efaaa7f6e38b8e2354' then
    raise exception 'dcr prestate: persist_document_extraction body drifted (sha %)',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode = 'CLR10';
  end if;
  if (select p.proowner from pg_proc p
       where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure)
     <> 'clara_fn_owner'::regrole then
    raise exception 'dcr prestate: persist_document_extraction has an unexpected owner' using errcode = 'CLR10';
  end if;

  -- (d) THE CUTOVER SAFETY CHECK, and it is the load-bearing one. A field_path ALREADY stored
  -- that the new grammar would refuse means a live producer this repository does not know about
  -- is writing a shape the validator has not been taught. Refuse the cutover LOUDLY here rather
  -- than let that producer's next persist fail on the ingest path. The predicate below is the
  -- grammar, written inline because clara._assert_field_path does not exist yet; S4's tail
  -- re-runs the same census THROUGH the function, so the two derivations are proven to agree
  -- before this file commits.
  select coalesce(array_agg(distinct fp order by fp), array[]::text[]) into v_bad
    from (select r.field_path as fp from clara.document_regions r where r.field_path is not null) s
   where length(fp) = 0 or length(fp) > 128
      or fp !~ '^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)(\.([A-Za-z_][A-Za-z0-9_]*|[0-9]+)){0,11}$'
      or split_part(fp, '.', 1) not in ('invoice','statement','myinvois','opening_tb','prior_gl',
                                        'pages','tables','rows','sheets','paragraphs');
  -- TWO CAUSES, AND THEY WANT OPPOSITE ANSWERS, so the message names both rather than sending
  -- the reader down the wrong one. On a DEPLOYED database a refusal means a live PRODUCER writes
  -- a shape this file has not been taught: census it (packages/db/deploy/0191-field-path-census.sql
  -- probe 1), identify the producer, and widen the roster in a NEW append-only migration. On a
  -- developer RIG it almost certainly means a TEST FIXTURE inserted straight into
  -- clara.document_regions before this file was applied -- packages/runtime/tests'
  -- f-a1-witness-fixtures.mjs writes `ocr_total`, `ocr_net` and friends, and
  -- rig-docs-fixtures.mjs's seedRegion defaults to a bare `total`. None of those is a producer
  -- (they never pass through clara.persist_document_extraction), so the answer there is a fresh
  -- database, NEVER a wider grammar. Measured on the PG17 rig 2026-09-14: a cluster that had run
  -- the F-A1 witness battery before 0191 carried 42 such rows.
  if coalesce(array_length(v_bad, 1), 0) > 0 then
    raise exception 'dcr prestate: % stored field_path value(s) would be refused by the new grammar (first ten: %) -- on a deployed database this is a live producer emitting an untaught shape: census it and widen the roster in a NEW migration. On a rig it is almost certainly a TEST FIXTURE that inserted into clara.document_regions directly (ocr_*, a bare total); those are not producers, so apply this file to a database migrated from scratch instead of widening the grammar for them.',
      coalesce(array_length(v_bad, 1), 0), v_bad[1:10] using errcode = 'CLR10';
  end if;

  raise notice 'dcr prestate: clean -- % kinds derived from the live CHECK, persist_document_extraction at its 0123 body, and every stored field_path already conforms.', v_n;
end $dcr_pre$;

-- =====================================================================================
-- S1 -- clara.document_capabilities : THE REGISTRY.
-- =====================================================================================
set role clara_fn_owner;

create table clara.document_capabilities (
  format             text        not null check (btrim(format) <> ''),
  document_kind      text        not null check (btrim(document_kind) <> ''),
  mime_type          text        not null check (btrim(mime_type) <> ''),
  custody            text        not null check (custody in ('supported','stored_only','unsupported','planned')),
  byte_extraction    text        not null check (byte_extraction in ('supported','stored_only','unsupported','planned')),
  typed_facts        text        not null check (typed_facts in ('supported','stored_only','unsupported','planned')),
  business_operation text        not null check (business_operation in ('supported','stored_only','unsupported','planned')),
  engine_id          text        check (engine_id is null or btrim(engine_id) <> ''),
  engine_byte        text        check (engine_byte is null or btrim(engine_byte) <> ''),
  registry_version   int         not null check (registry_version >= 1),
  basis              text        not null check (btrim(basis) <> ''),
  limits             jsonb       not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  recorded_at        timestamptz not null default now(),
  primary key (format, document_kind)
);

comment on table clara.document_capabilities is
  'The VERSIONED capability registry (#624): for every admitted upload format x every live document kind, what Clara can actually do -- custody, byte extraction, typed facts and business operation, as four INDEPENDENT levels. Global (not per-firm), like clara.document_kind_codeability (0165) and clara.close_gate_checks (0056). Read by clara.get_document_state and rendered by the client Documents workbench so a professional is never shown a success that did not happen. It states CAPABILITY, never permission: the egress-consent gates remain the authority over whether a read may happen at all (#631).';
comment on column clara.document_capabilities.format is
  'The detector''s own format token (packages/runtime/lib/scan.mjs) -- pdf, png, jpeg, webp, tiff, heic, xml, csv, tsv, ofx, xlsx, docx.';
comment on column clara.document_capabilities.mime_type is
  'The ONE canonical mime that format canonicalizes to (packages/runtime/lib/intake.mjs MIME_ALIASES). One mime per format, asserted in this file''s tail; clara._document_format maps a stored documents.mime_type back to the format token, alias spellings included.';
comment on column clara.document_capabilities.custody is
  'Are the bytes sealed, hashed and retrievable? supported for every admitted format -- intake canonicalizes and sha256s before anything else runs.';
comment on column clara.document_capabilities.byte_extraction is
  'Did an INTAKE-TIME reader turn the bytes into stored extraction content? Format-intrinsic: the intake lane does not know the kind yet (packages/runtime/lib/intake-lanes.mjs says so in its own header). stored_only for ofx, whose intake lane is deliberately `none`.';
comment on column clara.document_capabilities.typed_facts is
  'Can a facts lane persist TYPED facts with source regions for this (format, kind)? supported where a reader demonstrably succeeds; stored_only where the router terminates cleanly (skipped_kind / skipped_type) so the document is kept and readable and nothing further is derived; unsupported where a lane is routed but no reader can succeed for this pair.';
comment on column clara.document_capabilities.business_operation is
  'Can this pair drive an accounting operation? supported where Clara can carry typed facts into it; stored_only where the filing is work a PERSON completes and Clara derives nothing to drive it (the honest "no placeholder success"); unsupported where the kind carries no business operation at all.';
comment on column clara.document_capabilities.engine_id is
  'The engine that delivers the highest supported level for this pair -- the typed-facts engine where typed_facts is supported, else the byte-extraction engine, else null.';
comment on column clara.document_capabilities.engine_byte is
  'The intake-time byte-extraction engine for this format, published separately because a surface must be able to name the engine that produced the STORED reading even when no facts lane exists.';
comment on column clara.document_capabilities.limits is
  'Named, machine-readable limitations of a level that is otherwise supported. `{"invoice_line_items":"planned"}` records the ONE capability deferred by this slice: invoice header facts are persisted with regions today, per-LINE facts are an accepted target with no table yet. A limit is not a lower level -- the header facts are real -- but a surface that rendered "facts: validated" without it would overstate what was read.';
comment on column clara.document_capabilities.basis is
  'Why, in a sentence a professional can argue with, naming the lane or the reason. Never blank.';

alter table clara.document_capabilities enable row level security;
alter table clara.document_capabilities force row level security;

-- Forced RLS applies to the owner too, so without this the DEFINER readers below -- which run
-- AS clara_fn_owner -- would read zero rows and every pair would silently read `unsupported`.
-- Safe-directioned but wrong, so it is walled here rather than trusted (0165's own lesson).
create policy p_document_capabilities_owner on clara.document_capabilities
  for all to clara_fn_owner using (true) with check (true);

-- There is no firm to scope BY -- the whole table is one global vocabulary with no tenant column
-- and nothing tenant-derived in it -- so the predicate is `true` and the honesty lives in the
-- SELECT-only verb and the absent write grant.
--
-- ONE APPLICATION LANE HOLDS THE TABLE, AND IT IS THE HUMAN ONE. The first cut admitted
-- clara_agent_ro here too, on the reasoning that "the agent lane must be able to read what it
-- cannot do" -- which is true, and is not an argument for a TABLE grant. 0165, the file this
-- registry is modelled on (clara.document_kind_codeability, its own header says so), settled the
-- same question the other way and its tail pins the answer: `clara_agent_ro holds NO table
-- privilege and reaches the vocabulary only through clara._is_codeable_kind`. The agent lane keeps
-- exactly that shape here -- clara._document_capability(text,text), clara._document_format(text)
-- and clara.get_document_state(uuid,uuid) are EXECUTE-granted to it below, all three SECURITY
-- DEFINER, and they are what the lane reads the registry through. A `using (true)` policy for a
-- role that already holds the definer doors measures nothing and scopes nothing; it is only a
-- second way in, and `packages/db/tests/rig-runtime-visibility.test.mjs`'s §6 agent sweep (the
-- agent lane has ZERO access to every new table) is the law that says so. This file's tail asserts
-- both halves.
create policy p_document_capabilities_read on clara.document_capabilities
  for select to clara_authenticated using (true);

reset role;

grant select on clara.document_capabilities to clara_authenticated;

-- =====================================================================================
-- S2 -- THE SEED. 12 formats x 20 kinds = 240 rows, DERIVED.
--
-- The KINDS come out of documents_document_kind_check through 0165's clara._document_kind_roster().
-- The FORMATS are runtime-owned (the intake allowlist is not a database object) and are therefore
-- the one typed input here -- transcribed from packages/runtime/lib/intake.mjs's MIME_ALIASES and
-- packages/runtime/lib/scan.mjs's detector, with the tail asserting one mime per format.
-- The LEVELS are computed by the rules below rather than typed 240 times, so each rule can be
-- read against the source it was derived from.
--
-- THE ROUTING THE typed_facts RULES ENCODE is clara._enqueue_invoice_facts_core's live body
-- (0123 section 6 as recut by 0177), read 2026-09-13:
--   pdf | image/*  -> kind null           : classify first (no facts promise before the kind)
--                  -> invoice|credit_note|debit_note|receipt : llm_witness, llm-openai:gpt-5.6-terra:v2
--                  -> bank_statement      : statement_facts, llm-openai:gpt-5.6-terra:stmt-witness-v1
--                  -> anything else       : terminal `skipped_kind`
--   xml            -> bank_statement      : terminal `skipped_type` (no xml statement parser exists)
--                  -> anything else       : local_facts, clara-myinvois:v1 (a MyInvois UBL reader)
--   text/csv | application/x-ofx -> bank_statement : statement_parse, clara-statement-parse:v1
--                  -> anything else       : terminal `skipped_type`
--   everything else (xlsx, docx, tsv, and every other mime) : terminal `skipped_type`
-- NOTE the two facts that a filename would have hidden: `text/tab-separated-values` is NOT in the
-- csv/ofx arm, so a TSV bank statement terminates; and xlsx/docx reach no facts lane at all.
-- =====================================================================================
with formats(format, mime_type) as (
  values ('pdf',  'application/pdf'),
         ('png',  'image/png'),
         ('jpeg', 'image/jpeg'),
         ('webp', 'image/webp'),
         ('tiff', 'image/tiff'),
         ('heic', 'image/heic'),
         ('xml',  'application/xml'),
         ('csv',  'text/csv'),
         ('tsv',  'text/tab-separated-values'),
         ('ofx',  'application/x-ofx'),
         ('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
         ('docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
), kinds(document_kind) as (
  select unnest(clara._document_kind_roster())
), pairs as (
  select f.format, f.mime_type, k.document_kind,
         f.format in ('pdf','png','jpeg','webp','tiff','heic') as ocr_family,
         f.format in ('xlsx','docx','csv','tsv')               as structured_family,
         clara._is_codeable_kind(k.document_kind)              as codeable
    from formats f cross join kinds k
), levelled as (
  select p.*,
    case when p.format = 'ofx' then 'stored_only' else 'supported' end as byte_extraction,
    case when p.format = 'ofx'           then 'clara-store-only:v1'
         when p.format = 'xml'           then 'clara-myinvois:v1'
         when p.structured_family        then 'clara-structured:v1'
         else 'azure-di:prebuilt-layout:2024-11-30' end as engine_byte,
    case
      -- 0014 / H-53: consent evidence is a LEGAL artifact and is structurally exempt from facts
      -- extraction on every format; clara.set_document_kind refuses the kind outright (CLR28).
      when p.document_kind = 'consent_evidence' then 'unsupported'
      when p.ocr_family and p.document_kind in ('invoice','credit_note','debit_note','receipt') then 'supported'
      when p.ocr_family and p.document_kind = 'bank_statement' then 'supported'
      when p.ocr_family then 'stored_only'
      -- The xml arm is kind-blind apart from bank_statement, but the only reader behind it is the
      -- MyInvois UBL parser: a payroll XML is routed and then fails the parse, which is a genuine
      -- `unsupported` rather than a clean terminal.
      when p.format = 'xml' and p.document_kind = 'bank_statement' then 'stored_only'
      when p.format = 'xml' and p.document_kind in ('e_invoice_xml','invoice','credit_note','debit_note') then 'supported'
      when p.format = 'xml' then 'unsupported'
      when p.format = 'csv' and p.document_kind = 'bank_statement' then 'supported'
      -- OFX: a reader exists and the bytes parse, but the format carries no opening balance, so
      -- corroborateChain raises header_unreadable on every OFX statement. Measured, not assumed.
      when p.format = 'ofx' and p.document_kind = 'bank_statement' then 'unsupported'
      else 'stored_only'
    end as typed_facts
    from pairs p
), composed as (
  select l.*,
    case
      when l.document_kind = 'consent_evidence' then 'unsupported'
      when l.document_kind = 'bank_statement'
        then case when l.typed_facts = 'supported' then 'supported' else 'stored_only' end
      -- Opening balances and a prior general ledger DO have a business operation -- the governed
      -- opening-seed door -- but it is a human act over the stored reading, never something Clara
      -- drives off a filing. stored_only is the honest level for both.
      when l.document_kind in ('opening_balance_doc','prior_gl') then 'stored_only'
      when not l.codeable then 'unsupported'
      when l.typed_facts = 'supported' then 'supported'
      else 'stored_only'
    end as business_operation,
    case
      when l.typed_facts = 'supported' and l.ocr_family
           and l.document_kind in ('invoice','credit_note','debit_note','receipt')
        then 'llm-openai:gpt-5.6-terra:v2'
      when l.typed_facts = 'supported' and l.ocr_family and l.document_kind = 'bank_statement'
        then 'llm-openai:gpt-5.6-terra:stmt-witness-v1'
      when l.typed_facts = 'supported' and l.format = 'xml' then 'clara-myinvois:v1'
      when l.typed_facts = 'supported' and l.format = 'csv' then 'clara-statement-parse:v1'
      when l.byte_extraction = 'supported' then l.engine_byte
      else null
    end as engine_id,
    case
      when l.typed_facts = 'supported'
           and l.document_kind in ('invoice','credit_note','debit_note','receipt','e_invoice_xml')
        then '{"invoice_line_items":"planned"}'::jsonb
      when l.format = 'ofx' and l.document_kind = 'bank_statement'
        then '{"opening_balance":"absent_in_format","reader":"parse_succeeds_corroboration_cannot"}'::jsonb
      when l.format = 'xml' and l.typed_facts = 'unsupported'
        then '{"reader":"myinvois_ubl_only"}'::jsonb
      when l.format = 'tsv' and l.document_kind = 'bank_statement'
        then '{"router":"tab_separated_mime_not_routed"}'::jsonb
      else '{}'::jsonb
    end as limits
    from levelled l
)
insert into clara.document_capabilities(format, document_kind, mime_type, custody, byte_extraction,
    typed_facts, business_operation, engine_id, engine_byte, registry_version, basis, limits)
select c.format, c.document_kind, c.mime_type,
  'supported',                      -- custody: intake canonicalizes, hashes and seals every admitted format
  c.byte_extraction, c.typed_facts, c.business_operation, c.engine_id, c.engine_byte,
  1,
  -- The basis sentence, composed from the same rules the levels were, so it can never describe a
  -- different row than the one it sits on.
  concat_ws(' ',
    case when c.byte_extraction = 'supported'
         then format('Bytes are sealed at intake and read by %s.', c.engine_byte)
         else format('Bytes are sealed at intake and deliberately NOT read there (%s): the format is machine-readable and the reader that understands it, if any, belongs to a later lane.', c.engine_byte) end,
    case c.typed_facts
      when 'supported' then format('Typed facts are persisted with source regions by %s.', c.engine_id)
      when 'stored_only' then 'The facts router terminates this pair cleanly (skipped_kind / skipped_type): the document stays stored and readable and Clara derives no typed facts from it.'
      when 'unsupported' then
        case when c.format = 'ofx' and c.document_kind = 'bank_statement'
               then 'The OFX reader parses the file, but OFX carries no opening balance, so the statement identity can never close and corroboration refuses header_unreadable. No typed facts are possible for this pair.'
             when c.document_kind = 'consent_evidence'
               then 'Consent evidence is a legal artifact and is structurally exempt from facts extraction (0014); set_document_kind refuses the kind outright.'
             else 'The routed reader cannot read this pair: the local facts lane reads MyInvois UBL only.' end
      else 'Typed facts are an accepted target for this pair and are not built.' end,
    case c.business_operation
      when 'supported' then 'A filed document of this kind carries a business operation Clara can drive from those facts.'
      when 'stored_only' then 'The filing appears as work a person completes; Clara derives nothing to drive it.'
      when 'unsupported' then 'This kind carries no accounting operation at all.'
      else 'The operation is an accepted target and is not built.' end)
  as basis,
  c.limits
from composed c;

-- =====================================================================================
-- S3 -- clara._document_format(text) : STORED MIME -> FORMAT TOKEN.
--
-- clara.documents stores a MIME, never the detector's format token, so every reader of this
-- registry needs this map. It admits the ALIAS spellings too (text/xml, application/ofx,
-- application/x-qfx, application/vnd.intu.qfx, application/csv), because a document ingested
-- before intake canonicalized a spelling would otherwise read as an unknown format and be told,
-- wrongly, that Clara can do nothing with it.
--
-- IMMUTABLE would be honest for the map itself but the function reads the registry table for its
-- canonical half, so STABLE is the truth.
-- =====================================================================================
set role clara_fn_owner;

create function clara._document_format(p_mime text) returns text
  language sql stable security definer set search_path = clara, pg_catalog, pg_temp as $fn$
  select coalesce(
    (select c.format from clara.document_capabilities c
      where c.mime_type = lower(btrim(coalesce(p_mime, ''))) limit 1),
    case lower(btrim(coalesce(p_mime, '')))
      when 'text/xml' then 'xml'
      when 'application/ofx' then 'ofx'
      when 'application/x-qfx' then 'ofx'
      when 'application/vnd.intu.qfx' then 'ofx'
      when 'application/csv' then 'csv'
      else null
    end);
$fn$;
revoke all on function clara._document_format(text) from public;
alter function clara._document_format(text) owner to clara_fn_owner;
comment on function clara._document_format(text) is
  'A stored clara.documents.mime_type -> the detector''s format token, canonical spellings from the registry itself plus the live aliases packages/runtime/lib/intake.mjs canonicalizes. NULL for a mime the intake never admitted (#624).';

-- =====================================================================================
-- S4 -- clara._document_capability(format, kind) : THE READER, WITH HONEST DEFAULTS.
--
-- TWO UNKNOWNS, and they are DIFFERENT unknowns -- the 0165 shape, pointed the other way:
--   an unknown PAIR      -- nothing is claimed. Every level reads `unsupported`, including
--                           custody: a format intake never admitted has no custody to claim.
--   a NULL kind          -- the bytes are real, so custody and byte_extraction are published
--                           truthfully; typed_facts and business_operation read `unsupported`
--                           and `kind_known:false` says WHY. This is the honest direction here,
--                           the mirror of 0165's: over-claiming a facts level before the kind is
--                           known is exactly the placeholder success #624 exists to remove.
-- =====================================================================================
create function clara._document_capability(p_format text, p_kind text) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $fn$
  select case
    when p_kind is not null and exists(
      select 1 from clara.document_capabilities c
       where c.format = p_format and c.document_kind = p_kind)
    then (select jsonb_build_object(
            'format', c.format, 'document_kind', c.document_kind, 'mime_type', c.mime_type,
            'custody', c.custody, 'byte_extraction', c.byte_extraction,
            'typed_facts', c.typed_facts, 'business_operation', c.business_operation,
            'engine_id', c.engine_id, 'engine_byte', c.engine_byte,
            'registry_version', c.registry_version, 'basis', c.basis, 'limits', c.limits,
            'known_pair', true, 'kind_known', true)
          from clara.document_capabilities c
         where c.format = p_format and c.document_kind = p_kind)
    when p_kind is null and exists(select 1 from clara.document_capabilities c where c.format = p_format)
    then (select jsonb_build_object(
            'format', c.format, 'document_kind', null, 'mime_type', c.mime_type,
            'custody', c.custody, 'byte_extraction', c.byte_extraction,
            'typed_facts', 'unsupported', 'business_operation', 'unsupported',
            'engine_id', c.engine_byte, 'engine_byte', c.engine_byte,
            'registry_version', c.registry_version,
            'basis', 'The document kind is not yet known. Its bytes are sealed and '
                     || case when c.byte_extraction = 'supported' then 'read' else 'deliberately not read at intake' end
                     || '; no facts or operation can be promised until classification completes.',
            'limits', '{}'::jsonb, 'known_pair', true, 'kind_known', false)
          from clara.document_capabilities c where c.format = p_format
          order by c.document_kind limit 1)
    else jsonb_build_object(
      'format', p_format, 'document_kind', p_kind, 'mime_type', null,
      'custody', 'unsupported', 'byte_extraction', 'unsupported',
      'typed_facts', 'unsupported', 'business_operation', 'unsupported',
      'engine_id', null, 'engine_byte', null,
      'registry_version', (select max(registry_version) from clara.document_capabilities),
      'basis', 'This format is not in Clara''s admitted upload set, so nothing about it is claimed.',
      'limits', '{}'::jsonb, 'known_pair', false, 'kind_known', p_kind is not null)
  end;
$fn$;
revoke all on function clara._document_capability(text,text) from public;
alter function clara._document_capability(text,text) owner to clara_fn_owner;
comment on function clara._document_capability(text,text) is
  'The registry''s ONE reader. An unknown (format, kind) pair claims nothing; a not-yet-classified document publishes its real custody/byte_extraction and promises no facts level (kind_known:false). The honest default in both directions (#624).';

reset role;

-- Both application read lanes: the workbench renders the answer, and the agent lane must be able
-- to read what it cannot do rather than inferring capability from a filename.
grant execute on function clara._document_format(text) to clara_authenticated, clara_agent_ro;
grant execute on function clara._document_capability(text,text) to clara_authenticated, clara_agent_ro;

-- =====================================================================================
-- S5 -- clara._assert_field_path(text) : THE CANONICAL field_path GRAMMAR (C33.4).
--
-- THE SHAPE, stated so a reader never has to reverse it out of a regex:
--   * dot-separated segments, at least one, at most 12;
--   * each segment is either an unsigned integer (`1`, `0`, `19999`) or an identifier
--     `[A-Za-z_][A-Za-z0-9_]*` (`lines`, `A1`, `AA128`, `total_excl_tax`);
--   * at most 128 characters overall;
--   * the FIRST segment is one of the registered namespaces below.
--   * NULL passes -- clara.document_regions.field_path is nullable by design and a region
--     without a named field is legitimate evidence, not a malformed one.
--
-- MIXED CASE AND BARE INTEGERS ARE ADMITTED DELIBERATELY, and this is the census talking rather
-- than a taste: packages/runtime/lib/egress.mjs emits `pages.1.lines.0` and `tables.0.cells.3`
-- on the hot OCR path, and packages/runtime/lib/structured-worker.mjs emits `sheets.0.A1` -- an
-- A1 cell reference, so uppercase column letters are ordinary. A lowercase-only grammar would
-- have refused both lanes on the first real upload. What the grammar DOES refuse is everything
-- that is not a path at all: empty segments, whitespace, statement terminators, traversal shapes,
-- markup, an unbounded length, and -- the term that carries the most weight -- a first segment no
-- producer in this estate owns.
--
-- THE NAMESPACE ROSTER IS CENSUSED, not speculative. Ten namespaces, nine with a named PRODUCER
-- and one (`statement`) with a named READER, which is said plainly rather than blurred:
--   pages, tables        -- egress.mjs normalizeAzureLayout (the `ocr` lane)
--   rows, sheets, paragraphs -- structured-worker.mjs parseCsv / parseXlsx / parseDocx
--   myinvois             -- myinvois.mjs parseUblIdentity
--   opening_tb           -- opening-tb-cells.mjs
--   prior_gl             -- seeding-parse.mjs's prior-GL regions
--   invoice              -- persist_invoice_facts' closed seven (widened by 0022/0052 to the
--                           twenty-one it holds today), persist_witness_facts' belt + optional
--                           arrays, and myinvois.mjs mapFactsFields
--   statement            -- NO in-repo writer emits a `statement.*` region today: the typed
--                           statement facts live in clara.bank_statements / _lines, not in
--                           clara.document_regions. It is admitted because it is the vocabulary
--                           apps/web/lib/documents/extract-shape.ts tiers and labels, and the
--                           statement reader is the next producer in line. That is a deliberate
--                           one-namespace exception to "no namespace without a producer", and
--                           naming it here is cheaper than a reader discovering it later.
-- A namespace with no producer was NOT added: widening the accepted surface for nothing is how
-- a validator stops being one. A future producer's namespace is a one-line append-only change,
-- and the migration's prestate refuses a cutover while any stored path is outside the roster.
-- =====================================================================================
set role clara_fn_owner;

create function clara._assert_field_path(p_path text) returns void
  language plpgsql immutable set search_path = clara, pg_temp as $fn$
begin
  if p_path is null then return; end if;
  if length(p_path) = 0 or length(p_path) > 128 then
    raise exception 'field_path % is not canonical: length must be 1..128 characters', quote_literal(left(p_path, 160))
      using errcode = 'CLR10', detail = '{"reason":"field_path_length"}';
  end if;
  if p_path !~ '^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)(\.([A-Za-z_][A-Za-z0-9_]*|[0-9]+)){0,11}$' then
    raise exception 'field_path % is not canonical: expected dot-separated identifier or integer segments', quote_literal(left(p_path, 160))
      using errcode = 'CLR10', detail = '{"reason":"field_path_syntax"}';
  end if;
  if split_part(p_path, '.', 1) not in
      ('invoice','statement','myinvois','opening_tb','prior_gl',
       'pages','tables','rows','sheets','paragraphs') then
    raise exception 'field_path % is not canonical: % is not a registered namespace',
      quote_literal(left(p_path, 160)), quote_literal(split_part(p_path, '.', 1))
      using errcode = 'CLR10', detail = '{"reason":"field_path_namespace"}';
  end if;
end $fn$;
revoke all on function clara._assert_field_path(text) from public;
alter function clara._assert_field_path(text) owner to clara_fn_owner;
comment on function clara._assert_field_path(text) is
  'The canonical field_path grammar (C33.4), enforced at clara.persist_document_extraction -- the ONE region writer that took field_path verbatim. The two closed allowlists (persist_invoice_facts, persist_witness_facts) are untouched: they were already closed sets. NULL passes; anything that is not a dot-separated path of identifier/integer segments under a registered namespace raises CLR10 (#624).';

reset role;

-- INVOKER-reachable is not required (the only caller is a DEFINER writer), but both read lanes
-- get EXECUTE so a surface can pre-validate a path it is about to cite without a round trip
-- through a writer.
grant execute on function clara._assert_field_path(text) to clara_authenticated, clara_agent_ro;

-- =====================================================================================
-- S6 -- THE RECUT. clara.persist_document_extraction validates field_path at its own boundary.
--
-- The 0177 ceremony exactly: read the live definition through pg_get_functiondef so the header,
-- SECURITY DEFINER and search_path are carried verbatim and the web SQL-function census can
-- prove which function the EXECUTE recreates; replace exactly ONE anchor, counted first; then
-- post-check the owner, the ACL, the DEFINER posture and the search_path.
--
-- ONE LINE IS INSERTED, at the top of the region loop, before any other per-region work. It is
-- deliberately the FIRST statement in the loop: a malformed path must be refused before the
-- opening-fact derivation spends anything on it, and before the structured_parse attribution
-- allowlist -- which is a DIFFERENT, narrower wall about identifiers, not about syntax.
--
-- APPLY DURING THE WRITER-QUIESCENCE WINDOW for function-body replacement. The rollback is the
-- reverse dependency: a NEW append-only migration restoring the prior body. Never edit 0191.
-- =====================================================================================
do $dcr_splice$
declare
  v_def text;
  v_anchor text;
  v_replacement text;
  v_owner oid;
  v_acl aclitem[];
begin
  select p.proowner, p.proacl into v_owner, v_acl from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;

  v_anchor := $anchor$    for elem in select value from jsonb_array_elements(coalesce(p_regions,'[]'::jsonb)) loop
$anchor$;
  v_replacement := $replacement$    for elem in select value from jsonb_array_elements(coalesce(p_regions,'[]'::jsonb)) loop
      perform clara._assert_field_path(elem->>'field_path');
$replacement$;

  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'dcr splice: the region-loop anchor is not unique in persist_document_extraction'
      using errcode = 'CLR10';
  end if;

  v_def := replace(v_def, v_anchor, v_replacement);
  execute v_def;

  if (select p.proowner from pg_proc p
       where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure)
     <> v_owner then
    raise exception 'dcr splice poststate: function owner moved' using errcode = 'CLR10';
  end if;
  if (select p.proacl from pg_proc p
       where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure)
     is distinct from v_acl then
    raise exception 'dcr splice poststate: function ACL moved' using errcode = 'CLR10';
  end if;
end $dcr_splice$;

do $dcr_splice_post$
declare
  v_src text;
  v_secdef boolean;
  v_config text;
begin
  select p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
    into v_src, v_secdef, v_config
    from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;

  -- THE POST-IMAGE SHA, PINNED. The substring probes below say the splice did the right things;
  -- only a whole-body hash says it did NOTHING ELSE, and it is what lets the NEXT recut of this
  -- function pin its own pre-image against a value someone measured rather than one it discovers
  -- (0177:107-111 set that precedent for exactly this function family, and the first cut of this
  -- file dropped it). Measured on a PG17 rig whose pre-image was the pinned 0123 body.
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <>
      '0230031fe7d3f18332310fc19f39936b1408cb89ba597f77ce576017fea35905' then
    raise exception 'dcr splice poststate: body sha256 is % -- the splice produced a body nobody measured; do not trust the substring probes below it',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode = 'CLR10';
  end if;
  if position($needle$perform clara._assert_field_path(elem->>'field_path');$needle$ in v_src) = 0 then
    raise exception 'dcr splice poststate: the field_path assertion is absent' using errcode = 'CLR10';
  end if;
  if (length(v_src) - length(replace(v_src, 'clara._assert_field_path', ''))) / length('clara._assert_field_path') <> 1 then
    raise exception 'dcr splice poststate: the assertion was inserted more than once' using errcode = 'CLR10';
  end if;
  -- Every pre-existing limb, re-read from the installed body. A splice that quietly dropped one
  -- of these would be a security regression wearing a validator's clothes.
  if position('classify tasks are settled by classify_document' in v_src) = 0
     or position('persist_document_extraction only settles ocr/structured_parse tasks' in v_src) = 0
     or position('store-only tasks do not create extractions' in v_src) = 0
     or position('attribution_field_not_allowed' in v_src) = 0
     or position('firm_narrow_output_forbidden' in v_src) = 0
     or position($needle$v_ekind:=case when t.lane='ocr' then 'ocr' else 'structured_parse' end;$needle$ in v_src) = 0
     or position('document.extraction_completed' in v_src) = 0
     or position('opening_extraction_fact_unverifiable' in v_src) = 0 then
    raise exception 'dcr splice poststate: an existing gate or limb moved' using errcode = 'CLR10';
  end if;
  -- f-a7 gamma cell 36's own invariant: v_ekind is assigned EXACTLY once.
  if (length(v_src) - length(replace(v_src, 'v_ekind:=', ''))) / length('v_ekind:=') <> 1 then
    raise exception 'dcr splice poststate: v_ekind is no longer assigned exactly once' using errcode = 'CLR10';
  end if;
  if v_secdef is not true or position('search_path=' in v_config) = 0 then
    raise exception 'dcr splice poststate: SECURITY DEFINER or search_path did not carry over (config: %)', v_config
      using errcode = 'CLR10';
  end if;
end $dcr_splice_post$;

-- =====================================================================================
-- S7 -- clara.document_fact_validations : THE PERSISTED VALIDITY FLAG.
--
-- #624 acceptance 2: "persist typed facts with ... arithmetic validation; invalid or partial
-- facts remain visible and block only dependent work." Before this file, arithmetic validity was
-- a READ-TIME verdict only -- clara._invoice_fact_state re-derives the six-term identity on every
-- call and returns a boolean -- so nothing on the surface could say WHICH check failed, and a
-- historical read could not be distinguished from a current one.
--
-- HOW THE ROWS ARE WRITTEN, and why NO facts writer is recut for it. The two writers that would
-- have had to change (clara.persist_witness_facts, clara.persist_statement_facts*) are large,
-- audited, frozen-adjacent bodies on the egress path; three splices to record a derived fact
-- would be three chances to break a persist that works. Instead the validation is computed by
-- DEFERRABLE CONSTRAINT TRIGGERS that fire AT COMMIT, by which time the facts rows AND their
-- regions are all present in the same transaction the persist ran in. One object per family,
-- every writer covered, and not one line of a live persist body touched.
--
-- APPEND-ONLY, AND REVISIONED. A validation is a measurement taken at a moment; it is never
-- updated or deleted. The unique key is (extraction_id, check_name, revision) for the invoice
-- family and (statement_id, check_name, revision) for the statement family, so a replayed persist
-- still collides at revision 1 and is collapsed, while a later child row that genuinely moves the
-- verdict APPENDS revision n+1 (S7a-bis) instead of updating the row or being refused. Readers
-- take the highest revision per subject and check; every earlier measurement stays on file.
-- No application role holds INSERT, UPDATE or DELETE on this table at all: the only writers are
-- the definer trigger bodies below. There is no trigger forbidding an OWNER-level UPDATE, which
-- is stated here rather than implied by the word "append-only".
--
-- THE WRITE-PATH LAW THIS RESTS ON, STATED because the triggers alone do not imply it:
-- REVISION 1 IS COMPUTED AT COMMIT FROM THE HEADER INSERT. Every in-repo facts writer
-- (clara.persist_document_extraction, clara.persist_invoice_facts, clara.persist_witness_facts,
-- clara.persist_statement_facts*) inserts the header AND its children inside ONE transaction, so
-- the deferred recorder always sees a complete child set, and for them that first measurement is
-- the whole story.
--
-- A LATER CHILD ROW IS NOT AN ERROR; A STALE RECORD IS. The first cut of this file REFUSED a
-- region arriving after its extraction's own commit (CLR10 `fact_validation_would_go_stale`), on
-- the reasoning that no in-repo writer produces one. That reasoning was correct about the WRITERS
-- and wrong about the ESTATE: it put a wall across every fixture, harness and future back-fill
-- that assembles a document in more than one transaction. Measured at wave-2 integration (CI run
-- 34793833626): 291 db cells and 7 runtime cells red on it -- among them cells whose re-derived
-- verdict was IDENTICAL to the recorded one, refused anyway because the trigger compared before it
-- asked whether anything had actually changed. A belt that refuses writes it AGREES with is not
-- protecting the record; it is enforcing a sequencing convention.
--
-- SO THE REGION SIDE APPENDS INSTEAD OF REFUSING (S7a-bis below):
--   * the re-derived verdict EQUALS the recorded one -- nothing happens. No row, no error. This is
--     the supported path, and it is also the common later-region case;
--   * it DIFFERS -- a NEW REVISION is appended for that (extraction, check_name). The earlier row
--     is never updated and never deleted, so the append-only property the surfaces and the runtime
--     battery both rely on is preserved exactly; readers take the highest revision, and what Clara
--     believed, and when, stays on file.
-- The record therefore cannot go stale -- which is what the refusal was for -- and the cost is one
-- extra row rather than a failed write.
--
-- THE STATEMENT SIDE IS DIFFERENT, AND DELIBERATELY LEFT ALONE. 0038's own
-- `_tf_bank_statement_belt` is attached to clara.bank_statement_lines as well as to
-- clara.bank_statements and re-derives line_count congruence, so a lone later line is refused
-- CLR10 -- by a MERGED migration, for a reason of its own: a statement's declared `line_count` is
-- part of the statement as filed, not a verdict derived from it, so a line that contradicts it is
-- a bad write rather than new information. Measured on the PG17 rig (2026-09-14): a chain-NEUTRAL
-- pair of later lines -- which would have slipped past a chain-only check while still moving the
-- printed-totals sums -- was refused with "statement % declares % line(s) but carries %" (0038's
-- own wording). This file neither duplicates nor relaxes it, and
-- packages/db/tests/document-fact-validation-belt.test.mjs records both behaviours side by side so
-- the asymmetry is visible rather than surprising.
--
-- BLOCKING IS NOT THIS TABLE'S JOB. A `fail` row does not stop the facts from being readable and
-- does not by itself stop anything: clara._invoice_fact_state's own verdict already governs what
-- dependent work may proceed. This table makes the reason VISIBLE. The region-side belt does not
-- block either -- it refuses nothing at all now, it only keeps the record current by appending.
-- =====================================================================================
set role clara_fn_owner;

create table clara.document_fact_validations (
  id            uuid        primary key default gen_random_uuid(),
  firm_id       uuid        not null,
  document_id   uuid        not null,
  extraction_id uuid,
  statement_id  uuid,
  check_name    text        not null check (btrim(check_name) <> ''),
  outcome       text        not null check (outcome in ('pass','fail','not_applicable','unmeasured')),
  engine_id     text,
  detail        jsonb       not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  revision      int         not null default 1 check (revision >= 1),
  evaluated_at  timestamptz not null default now(),
  constraint ck_document_fact_validations_subject
    check ((extraction_id is not null) <> (statement_id is not null)),
  constraint fk_document_fact_validations_document
    foreign key (document_id, firm_id) references clara.documents(id, firm_id) on delete cascade
);

-- ONE ROW PER (subject, check_name, REVISION). `revision` JOINS the key rather than loosening it:
-- a replayed persist still collides at revision 1 and is collapsed by the recorders' own
-- `on conflict do nothing`, and the only way to get a second row for one check is to APPEND the
-- next revision through S7a-bis, which happens only when the re-derived verdict actually differs.
-- The btree is ordered (subject, check_name, revision), so "the current verdict" is a one-row
-- index read (`order by revision desc limit 1`) and needs no second index.
-- Only the invoice family has an appender today; the statement family's child-side belt (0038's
-- own, on clara.bank_statement_lines) refuses a lone later line outright, so its rows never leave
-- revision 1. The key is shaped the same on both sides so that fact is a property of the WRITERS
-- rather than of the schema, and a future statement-side appender needs no DDL.
create unique index uq_document_fact_validations_extraction
  on clara.document_fact_validations(extraction_id, check_name, revision) where extraction_id is not null;
create unique index uq_document_fact_validations_statement
  on clara.document_fact_validations(statement_id, check_name, revision) where statement_id is not null;
create index ix_document_fact_validations_document
  on clara.document_fact_validations(firm_id, document_id, evaluated_at desc);

comment on table clara.document_fact_validations is
  'Append-only measurements: one row per (facts extraction | bank statement) x named arithmetic check x revision. pass / fail / not_applicable / unmeasured, with the terms in `detail`. Revision 1 is written by a deferrable constraint trigger at the header''s own commit, so no live persist body was recut to record it; a later region that genuinely moves the invoice identity APPENDS the next revision rather than updating the row or being refused, and readers take the highest revision per subject and check. A fail row does NOT block: clara._invoice_fact_state remains the authority over dependent work; this table makes the reason visible on the document surface (#624).';
comment on column clara.document_fact_validations.revision is
  'Monotonic per (extraction_id | statement_id, check_name), starting at 1. The CURRENT verdict is the highest revision; every lower one is the measurement that stood before it and is never updated or deleted. Only clara._tf_document_region_fact_validate appends above 1, and only when a later identity region changes the re-derived verdict.';
comment on column clara.document_fact_validations.outcome is
  'pass = the check ran and held. fail = it ran and did not. not_applicable = the check cannot apply to this source (a format with no printed totals). unmeasured = the terms the check needs were not all persisted, so no verdict is possible -- deliberately distinct from pass.';

alter table clara.document_fact_validations enable row level security;
alter table clara.document_fact_validations force row level security;

create policy p_document_fact_validations_owner on clara.document_fact_validations
  for all to clara_fn_owner using (true) with check (true);
-- TWO POLICIES, ONE PER LANE -- the shape every sibling document table already uses
-- (0007:788-791 for clara.document_extractions and clara.document_regions). The first cut used a
-- single policy over `clara.actor_firm_id()`, which is `coalesce(wake_firm(), jwt_firm())`, and
-- 0002:440-443's own comment says that resolver is never to carry an authorization decision: it
-- answers whichever lane happens to be present, so a human session that also carried a wake GUC
-- would be scoped by the AGENT's firm. Splitting the lanes makes each policy answer exactly one
-- question, and makes this table's RLS read the same as the rows it describes.
create policy p_document_fact_validations_human on clara.document_fact_validations
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
create policy p_document_fact_validations_agent on clara.document_fact_validations
  for select to clara_agent_ro using (firm_id = clara.wake_firm());

reset role;

grant select on clara.document_fact_validations to clara_authenticated, clara_agent_ro;

-- ------------------------------------------------------------------------------------
-- S7a -- the invoice six-term identity, recorded.
--
-- THE IDENTITY, carried verbatim from clara._invoice_fact_state's own live term (0100:345-346's
-- lineage): net + service_charge + delivery + tax + rounding - discount = total, in cents, over
-- the regions of the extraction that just landed. An absent optional component reads zero, which
-- is the same convention the read-time verdict uses.
--
-- THREE OUTCOMES, and the third is the honest one. `unmeasured` fires when `invoice.total` is
-- present but net or tax is not -- the LEGACY clara.persist_invoice_facts regime persists cents
-- for total/amount_due/deposit only, so the identity genuinely cannot be evaluated there. Calling
-- that a pass would be the placeholder success this ticket exists to remove.
-- ------------------------------------------------------------------------------------
set role clara_fn_owner;

-- ONE READER, TWO TRIGGERS. The identity is derived HERE and nowhere else, so the header-side
-- writer and the region-side belt below cannot drift into two arithmetics that disagree about
-- the same extraction -- which is the failure mode a second transcribed copy would eventually
-- produce, and the one 0038's "two triggers, ONE body" note exists to prevent.
--
-- IT RE-QUERIES BY ID and never reads a NEW tuple (the 0009:524-529 idiom, as 0037 and 0038
-- apply it). At deferred time a NEW tuple is a snapshot of the row as it was when the trigger
-- was QUEUED; a later statement in the same transaction may have changed it, and a body that
-- trusted the snapshot would certify a row that no longer exists in that shape.
create function clara._invoice_identity_verdict(p_extraction uuid)
  returns table (outcome text, residual_cents bigint, detail jsonb)
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  v_total bigint; v_net bigint; v_tax bigint;
  v_sc bigint; v_disc bigint; v_dlv bigint; v_round bigint;
  v_total_c int; v_net_c int; v_tax_c int;
  v_sc_c int; v_disc_c int; v_dlv_c int; v_round_c int;
  v_outcome text; v_residual bigint; v_reason text; v_counts jsonb;
begin
  -- CARDINALITY IS READ ALONGSIDE THE VALUE, and that is not defensive noise -- it is what keeps
  -- this record from contradicting the live authority. clara.evaluate_witness_fact_state_v1
  -- (0092:444,456) requires EXACTLY ONE region for total / net / tax and AT MOST ONE for each
  -- optional component, and REFUSES otherwise. A `max(...) filter (...)` alone silently picks the
  -- larger of two differing `invoice.total` regions, so the first cut of this body could record
  -- `pass` on an extraction the authority refuses. The asymmetry below is 0092's, mirrored rather
  -- than reinvented: exactly-one for the three load-bearing terms, at-most-one for the four
  -- optional ones.
  select
    count(*) filter (where field_path = 'invoice.total'),
    count(*) filter (where field_path = 'invoice.total_excl_tax'),
    count(*) filter (where field_path = 'invoice.tax_total'),
    count(*) filter (where field_path = 'invoice.service_charge'),
    count(*) filter (where field_path = 'invoice.discount'),
    count(*) filter (where field_path = 'invoice.delivery'),
    count(*) filter (where field_path = 'invoice.rounding'),
    max(monetary_cents) filter (where field_path = 'invoice.total'),
    max(monetary_cents) filter (where field_path = 'invoice.total_excl_tax'),
    max(monetary_cents) filter (where field_path = 'invoice.tax_total'),
    max(monetary_cents) filter (where field_path = 'invoice.service_charge'),
    max(monetary_cents) filter (where field_path = 'invoice.discount'),
    max(monetary_cents) filter (where field_path = 'invoice.delivery'),
    max(monetary_cents) filter (where field_path = 'invoice.rounding')
    into v_total_c, v_net_c, v_tax_c, v_sc_c, v_disc_c, v_dlv_c, v_round_c,
         v_total, v_net, v_tax, v_sc, v_disc, v_dlv, v_round
    from clara.document_regions where extraction_id = p_extraction;

  v_counts := jsonb_build_object(
    'invoice.total', v_total_c, 'invoice.total_excl_tax', v_net_c, 'invoice.tax_total', v_tax_c,
    'invoice.service_charge', v_sc_c, 'invoice.discount', v_disc_c,
    'invoice.delivery', v_dlv_c, 'invoice.rounding', v_round_c);

  -- A ROW IS ALWAYS WRITTEN, and that is the point of this branch order. The first cut returned
  -- NOTHING when no `invoice.total` had landed, which left `get_document_state` publishing
  -- `validations: []` -- indistinguishable from "not evaluated yet" on a surface whose whole job
  -- is telling those apart. `unmeasured` with a NAMED reason is the honest answer: Clara looked,
  -- and there was nothing it could measure.
  if v_total_c = 0 then
    v_outcome := 'unmeasured'; v_reason := 'no_total_persisted';
  elsif v_total_c > 1 or v_net_c > 1 or v_tax_c > 1
        or v_sc_c > 1 or v_disc_c > 1 or v_dlv_c > 1 or v_round_c > 1 then
    -- Ordered BEFORE the missing-term arm deliberately: a duplicated term is the case where this
    -- record could have disagreed with the authority, so it is the reason worth surfacing.
    v_outcome := 'unmeasured'; v_reason := 'term_not_single';
  elsif v_net_c = 0 or v_tax_c = 0 then
    v_outcome := 'unmeasured'; v_reason := 'net_or_tax_not_persisted';
  else
    v_residual := (v_net + coalesce(v_sc,0) + coalesce(v_dlv,0) + v_tax + coalesce(v_round,0)
                   - coalesce(v_disc,0)) - v_total;
    v_outcome := case when v_residual = 0 then 'pass' else 'fail' end;
  end if;

  return query select v_outcome, v_residual,
    jsonb_strip_nulls(jsonb_build_object(
      'total_cents', v_total, 'total_excl_tax_cents', v_net, 'tax_total_cents', v_tax,
      'service_charge_cents', v_sc, 'discount_cents', v_disc, 'delivery_cents', v_dlv,
      'rounding_cents', v_round, 'residual_cents', v_residual,
      'identity', 'total_excl_tax + service_charge + delivery + tax_total + rounding - discount = total',
      'reason', v_reason,
      'term_count', case when v_reason is not null then v_counts end,
      'note', case v_reason
        when 'no_total_persisted' then 'this extraction persisted no invoice.total, so the identity has no left-hand side to check'
        when 'term_not_single' then 'a term is persisted more than once; the live authority (clara.evaluate_witness_fact_state_v1) refuses this shape, so no verdict is recorded for it'
        when 'net_or_tax_not_persisted' then 'the net and tax terms were not persisted as cents by this regime, so the identity cannot be evaluated'
        end));
end $fn$;
revoke all on function clara._invoice_identity_verdict(uuid) from public;
alter function clara._invoice_identity_verdict(uuid) owner to clara_fn_owner;
comment on function clara._invoice_identity_verdict(uuid) is
  'The invoice six-term identity over one extraction''s regions, derived ONCE: net + service_charge + delivery + tax + rounding - discount = total, in cents. Returns no row when nothing monetary landed. Read by BOTH validation triggers so the recorder and the belt cannot disagree about the same extraction (#624).';

create function clara._tf_document_fact_validate() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_v record; v_e record;
begin
  -- Re-read the extraction BY ID rather than trusting the queued snapshot (see the reader's
  -- own note above): at deferred time `new` is what the row looked like when this trigger was
  -- queued, and a later statement in the same transaction may have moved it.
  select e.id, e.firm_id, e.document_id, e.engine_id, e.engine_kind, e.status
    into v_e from clara.document_extractions e where e.id = new.id;
  if not found or v_e.status <> 'done'
     or v_e.engine_kind not in ('invoice_facts','llm_text_facts') then
    return null;
  end if;

  -- The reader ALWAYS returns exactly one row for a done invoice-facts extraction (see its own
  -- branch-order note): a row on file therefore means "Clara evaluated this", and its absence
  -- means "not evaluated", which is the distinction get_document_state has to be able to draw.
  select * into v_v from clara._invoice_identity_verdict(v_e.id);

  insert into clara.document_fact_validations(firm_id, document_id, extraction_id, check_name,
      outcome, engine_id, detail)
  values (v_e.firm_id, v_e.document_id, v_e.id, 'invoice.six_term_identity',
    v_v.outcome, v_e.engine_id, v_v.detail)
  on conflict do nothing;
  return null;
end $fn$;
revoke all on function clara._tf_document_fact_validate() from public;
alter function clara._tf_document_fact_validate() owner to clara_fn_owner;
comment on function clara._tf_document_fact_validate() is
  'Deferred constraint-trigger body on clara.document_extractions: RECORDS the invoice six-term identity for a done invoice_facts/llm_text_facts extraction at COMMIT, when its regions are all present. Writes pass/fail/unmeasured; never raises, never blocks (#624).';

create constraint trigger t_document_extractions_fact_validate
  after insert on clara.document_extractions
  deferrable initially deferred
  for each row execute function clara._tf_document_fact_validate();

-- ------------------------------------------------------------------------------------
-- S7a-bis -- THE REGION-SIDE BELT: it keeps the record CURRENT by appending, and refuses nothing.
--
-- THE BLIND SPOT, measured rather than reasoned about (PG17 rig, 2026-09-14). A trigger that
-- fires only on clara.document_extractions is STRUCTURALLY BLIND to a lone
-- `insert into clara.document_regions` against an extraction committed in an EARLIER
-- transaction: that write touches no extraction row, so it dodges the recorder entirely. Probed
-- directly -- a lone later region carrying `invoice.discount = 5000` was ACCEPTED and the
-- recorded verdict was NOT refreshed, so the row on file no longer described the regions on
-- file. `_tf_append_only` on clara.document_regions does not catch it: that trigger is
-- UPDATE/DELETE-only (tgtype 27), by design, because regions are inserted and never revised.
--
-- 0038:2300-2305 names this exact hazard for the statement/line pair and answers it by putting
-- the SAME belt on the child table. This is that answer, applied here -- with one deliberate
-- difference in what the child-side trigger DOES.
--
-- IT APPENDS; IT NEITHER REFUSES NOR OVERWRITES. The first cut of this trigger RAISED CLR10
-- (`fact_validation_would_go_stale`) on any later identity region, reasoning that no in-repo
-- writer produces one and that the only alternatives were an UPDATE -- which would destroy the
-- append-only property -- or a recomputation silently lost to `on conflict do nothing`. That was
-- a false trichotomy. The third option is to append a NEW REVISION of the same
-- (extraction, check_name), which is append-only BY CONSTRUCTION: the earlier measurement is
-- untouched and still readable, and the reader takes the highest revision. Measured at wave-2
-- integration (CI run 34793833626), the refusal cost 291 db cells and 7 runtime cells, INCLUDING
-- cells whose re-derived verdict was identical to the recorded one -- refused anyway, because the
-- trigger asked "did this arrive late?" before it asked "did anything actually change?". A belt
-- that refuses a write it AGREES with is enforcing a sequencing convention, not protecting a
-- record. The property that mattered -- a recorded verdict never describes regions that are not
-- on file -- is exactly what the append preserves, and it now holds for writers this file does
-- not know about instead of only for the ones it censused.
--
-- IT IS QUEUED FOR SEVEN PATHS ONLY. The verdict is a function of the seven identity terms, so
-- the trigger carries a `when` naming them -- see the trigger's own comment for why that is a
-- cost argument on the hot ingest path rather than a narrowing of what is protected. UNCHANGED by
-- the move from refusal to append: a region outside those seven cannot move the verdict, so it
-- has no revision to append either.
--
-- IT IS SILENT ON THE SUPPORTED PATH, and that is still the whole design. Every in-repo writer --
-- clara.persist_document_extraction, clara.persist_invoice_facts, clara.persist_witness_facts --
-- inserts the extraction AND its regions inside ONE transaction, so both triggers are queued
-- together and see the identical region set. Whichever fires first: if the belt runs before the
-- recorder there is no row yet and it returns; if after, it re-derives through the same reader,
-- agrees by construction, and writes NOTHING. A supported persist therefore still produces
-- exactly one row per check, at revision 1.
--
-- SEVERAL LATER REGIONS IN ONE TRANSACTION COLLAPSE CORRECTLY, stated because it is the one place
-- the append could have multiplied rows. Each queued region fires its own trigger; the first to
-- find a changed verdict appends revision n+1, and every later one in that same commit re-reads
-- THAT row -- a deferred trigger's SELECT sees rows written by an earlier deferred trigger in the
-- same transaction -- re-derives the same verdict and returns. One transaction that moves the
-- identity adds exactly one revision, never one per region.
--
-- THE LAW, STATED so a future reader does not have to re-derive it: revision 1 is computed at
-- COMMIT from the header insert; a later insert into clara.document_regions that MOVES the invoice
-- identity appends the next revision, and one that does not move it writes nothing at all. The
-- statement side keeps the older, stricter answer for a reason of its own -- 0038's belt on
-- clara.bank_statement_lines re-derives line_count congruence and REFUSES a lone later line with
-- CLR10, because a statement's declared line_count is part of the statement as filed rather than a
-- verdict derived from it. That is a MERGED migration and not this file's to relax;
-- packages/db/tests/document-fact-validation-belt.test.mjs cells both behaviours side by side so
-- the asymmetry is visible rather than surprising.
-- ------------------------------------------------------------------------------------
create function clara._tf_document_region_fact_validate() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_recorded record; v_now record; v_e record;
begin
  -- THE CURRENT VERDICT is the HIGHEST revision, never "the row": once this trigger can append,
  -- a second later region in a second later transaction must compare against what the FIRST one
  -- left behind, not against revision 1. The unique index is ordered (extraction_id, check_name,
  -- revision), so this is a one-row index read.
  select v.outcome, v.detail, v.revision
    into v_recorded
    from clara.document_fact_validations v
   where v.extraction_id = new.extraction_id
     and v.check_name = 'invoice.six_term_identity'
   order by v.revision desc
   limit 1;
  -- No recorded verdict yet: either this extraction owes none, or the recorder is queued behind
  -- this trigger in the SAME commit and will write it. Either way there is nothing to keep current.
  if not found then return null; end if;

  select * into v_now from clara._invoice_identity_verdict(new.extraction_id);

  -- COMPARE THE WHOLE `detail`, not just the outcome, and ASK THIS FIRST. Two later regions can
  -- leave the outcome alone while moving the terms under it (an added `invoice.discount` that
  -- happens to keep the residual at zero; a duplicated term that flips the reason), so `detail` is
  -- part of the verdict. jsonb equality is key-order independent, so this is a value comparison
  -- rather than a text one. NOTHING CHANGED => NOTHING HAPPENS: no row, no error, no log. This is
  -- the supported path (the recorder already saw these regions) and it is also the common
  -- later-region case, and the previous cut of this trigger refused it -- which is what made a
  -- correct write fail for a reason the caller could do nothing about.
  if v_now.outcome is not distinct from v_recorded.outcome
     and v_now.detail is not distinct from v_recorded.detail then
    return null;
  end if;

  -- THE VERDICT MOVED. Append the next revision; never update the row that stood before it, never
  -- delete it. The subject columns are re-read from the extraction rather than carried on the
  -- region, so a row this trigger writes is scoped exactly like the one the recorder wrote.
  select e.firm_id, e.document_id, e.engine_id
    into v_e from clara.document_extractions e where e.id = new.extraction_id;
  if not found then return null; end if; -- the extraction went away in this same transaction

  -- `on conflict do nothing` is load-bearing, not decoration: several identity regions queued in
  -- ONE transaction each fire this trigger, and although each re-reads the revision the previous
  -- one appended (a later command sees an earlier deferred trigger's write) and normally returns
  -- at the equality gate above, the insert is made idempotent at the key so no ordering assumption
  -- is doing safety work.
  insert into clara.document_fact_validations(firm_id, document_id, extraction_id, check_name,
      outcome, engine_id, detail, revision)
  values (v_e.firm_id, v_e.document_id, new.extraction_id, 'invoice.six_term_identity',
    v_now.outcome, v_e.engine_id, v_now.detail, v_recorded.revision + 1)
  on conflict do nothing;
  return null;
end $fn$;
revoke all on function clara._tf_document_region_fact_validate() from public;
alter function clara._tf_document_region_fact_validate() owner to clara_fn_owner;
comment on function clara._tf_document_region_fact_validate() is
  'Deferred constraint-trigger body on clara.document_regions: the region-side BELT. A region arriving in a LATER transaction than its extraction would silently stale the recorded invoice-identity verdict, so the verdict is RE-DERIVED at commit: unchanged => nothing is written; changed => the NEXT REVISION is appended for that (extraction, check_name), leaving every earlier measurement on file. It refuses nothing. Queued only for the seven field_paths the verdict is a function of (the trigger''s own `when`), and silent on the supported path, where extraction and regions land in one transaction (0038:2300-2305''s blind-spot lesson, #624).';

-- THE `when` CLAUSE IS LOAD-BEARING, and it is a cost argument rather than a correctness one.
-- The verdict this belt keeps current is a function of SEVEN field_paths and nothing else (see
-- clara._invoice_identity_verdict), so no other region can stale it. Without the clause the
-- trigger would be queued for EVERY region row: packages/runtime/lib/structured-worker.mjs caps
-- a spreadsheet at MAX_ITEMS = 50,000 cells, so one ordinary XLSX ingest would put fifty thousand
-- entries on the deferred-trigger queue and run fifty thousand index probes at COMMIT, on the hot
-- ingest path, to protect a verdict that pair can never have. PostgreSQL evaluates a CONSTRAINT
-- trigger's `when` at the time of the row operation and simply does not queue the row when it is
-- false (CREATE TRIGGER, "the evaluation of the WHEN condition is not deferred"), which is
-- exactly the property needed here -- and `new.field_path` is fixed at insert, so immediate
-- evaluation and deferred evaluation would agree anyway. Verified on the PG17 rig: a lone later
-- `pages.1.lines.0` region is not queued at all and appends nothing, while a lone later
-- `invoice.discount` region appends the next revision
-- (packages/db/tests/document-fact-validation-belt.test.mjs).
create constraint trigger t_document_regions_fact_validate
  after insert on clara.document_regions
  deferrable initially deferred
  for each row
  when (new.field_path in ('invoice.total','invoice.total_excl_tax','invoice.tax_total',
                           'invoice.service_charge','invoice.discount','invoice.delivery',
                           'invoice.rounding'))
  execute function clara._tf_document_region_fact_validate();

-- ------------------------------------------------------------------------------------
-- S7b -- the statement chain and printed-totals checks, recorded.
--
-- A statement that PERSISTED has already been refused-or-accepted by clara's own core (the
-- chain/totals refusals live at persist), so `pass` here is a receipt rather than a discovery --
-- and that is worth persisting precisely because the surface otherwise has nothing to show. The
-- interesting row is `not_applicable`: a format with no printed TOTAL DEBIT / TOTAL CREDIT pair
-- (OFX, and a CSV export that carries none) must not be shown as having passed a check it never
-- had, and must not be shown as having failed one either.
-- ------------------------------------------------------------------------------------
create function clara._tf_bank_statement_validate() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_sum bigint; v_debit bigint; v_credit bigint; v_engine text;
begin
  -- The engine that PRODUCED the reading, never the ingest mode: `structured` names how the read
  -- was bought, not what read it. Falls back to the mode only when no reader extraction is bound.
  select coalesce((select e.engine_id from clara.document_extractions e
                    where e.id = new.reader1_extraction_id), new.ingest_mode)
    into v_engine;
  select coalesce(sum(amount_cents), 0),
         coalesce(sum(amount_cents) filter (where amount_cents < 0), 0),
         coalesce(sum(amount_cents) filter (where amount_cents > 0), 0)
    into v_sum, v_debit, v_credit
    from clara.bank_statement_lines where statement_id = new.id;

  insert into clara.document_fact_validations(firm_id, document_id, statement_id, check_name,
      outcome, engine_id, detail)
  -- NO `unmeasured` ARM HERE, and its absence is measured rather than assumed: 0038:383-384
  -- declares clara.bank_statements.opening_cents and closing_cents NOT NULL, so a statement that
  -- reached this table always states both endpoints. A null-guard arm would have been dead code
  -- wearing the appearance of care -- and worse, it would have implied a reachable state the
  -- surfaces would then have had to render. (The printed-totals check below DOES keep its
  -- non-applicable arm: those two columns are genuinely nullable, which is the OFX case.)
  values (new.firm_id, new.document_id, new.id, 'statement.chain_closes',
    case when new.opening_cents + v_sum = new.closing_cents then 'pass' else 'fail' end,
    v_engine,
    jsonb_strip_nulls(jsonb_build_object(
      'opening_cents', new.opening_cents, 'closing_cents', new.closing_cents,
      'movement_cents', v_sum, 'line_count', new.line_count,
      'identity', 'opening + sum(amounts) = closing')))
  on conflict do nothing;

  insert into clara.document_fact_validations(firm_id, document_id, statement_id, check_name,
      outcome, engine_id, detail)
  values (new.firm_id, new.document_id, new.id, 'statement.printed_totals',
    case when new.total_debit_cents is null or new.total_credit_cents is null then 'not_applicable'
         when abs(new.total_debit_cents) = abs(v_debit) and new.total_credit_cents = v_credit then 'pass'
         else 'fail' end,
    v_engine,
    jsonb_strip_nulls(jsonb_build_object(
      'printed_total_debit_cents', new.total_debit_cents,
      'printed_total_credit_cents', new.total_credit_cents,
      'read_total_debit_cents', v_debit, 'read_total_credit_cents', v_credit,
      'note', case when new.total_debit_cents is null or new.total_credit_cents is null
                   then 'this source states no printed totals; the check does not apply to it' end)))
  on conflict do nothing;
  return null;
end $fn$;
revoke all on function clara._tf_bank_statement_validate() from public;
alter function clara._tf_bank_statement_validate() owner to clara_fn_owner;
comment on function clara._tf_bank_statement_validate() is
  'Deferred constraint-trigger body: records statement.chain_closes and statement.printed_totals for a landed bank statement at COMMIT. `not_applicable` on printed totals is the honest verdict for a source that states none (OFX by format, some CSV exports by choice) (#624).';

create constraint trigger t_bank_statements_fact_validate
  after insert on clara.bank_statements
  deferrable initially deferred
  for each row execute function clara._tf_bank_statement_validate();

reset role;

-- =====================================================================================
-- S8 -- clara.get_document_state(document, client) : THE FOUR STATES AND THE LINEAGE, TOGETHER.
--
-- #624 acceptance 4: "Documents and Work show extraction, facts, operation and failure states
-- INDEPENDENTLY." Before this file the workbench had to infer them from
-- `documents.extraction_status` alone, which is a single scalar describing the LAST task to
-- settle -- so a done OCR pass on a payroll PDF read as success, and there was nothing in the
-- read that could say the facts router had already terminated the pair.
--
-- Admission mirrors clara.get_document_extract exactly (0090:1558-1584): the dual-lane
-- wake/human context, the firm predicate, and the unassigned-or-filed-to-p_client rule. A
-- document this caller may not read returns NULL, never a partial answer.
-- =====================================================================================
set role clara_fn_owner;

create function clara.get_document_state(p_document uuid, p_client uuid default null) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  w record; hc record; v_firm uuid; d record; v_result jsonb;
  v_format text; v_cap jsonb;
begin
  if coalesce(current_setting('clara.wake_secret', true), '') <> '' then
    select * into w from clara.wake_context();
    if w.credential_id is null then
      raise exception 'no valid agent read context' using errcode = 'CLR03';
    end if;
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind, 'get_document_state');
    end if;
    if w.client_id is not null and p_client is distinct from w.client_id then return null; end if;
    v_firm := w.firm_id;
  else
    hc := clara._human_ctx(clara.role_rank('viewer')); v_firm := hc.firm;
  end if;

  select doc.*,
      not exists(select 1 from clara.document_filings f
                  where f.document_id = doc.id and f.retired_at is null) as unassigned
    into d
    from clara.documents doc where doc.id = p_document and doc.firm_id = v_firm;
  if not found then return null; end if;
  if not d.unassigned and not exists(
      select 1 from clara.document_filings f
       where f.document_id = d.id and f.client_id = p_client and f.retired_at is null) then
    return null;
  end if;

  v_format := clara._document_format(d.mime_type);
  v_cap := clara._document_capability(v_format, d.document_kind);

  select jsonb_build_object(
    'document_id', d.id,
    'document_kind', d.document_kind,
    'mime_type', d.mime_type,
    'format', v_format,
    'capability', v_cap,

    -- CUSTODY. The bytes themselves: sealed, hashed, and whether a legal hold pins them.
    'custody', jsonb_build_object(
      'state', case when d.bytes_verified_at is not null then 'verified'
                    when d.status = 'verified' then 'verified' else 'stored' end,
      'sha256', d.sha256, 'byte_size', d.byte_size,
      'bytes_verified_at', d.bytes_verified_at,
      'legal_hold', d.legal_hold, 'legal_hold_reason', d.legal_hold_reason,
      'retention_state', d.retention_state, 'retain_until', d.retain_until,
      'capability', v_cap->>'custody'),

    -- BYTE EXTRACTION. Per task, with its engine, so "done" can never stand in for "understood".
    'byte_extraction', jsonb_build_object(
      'status', d.extraction_status,
      'page_count', d.page_count,
      'capability', v_cap->>'byte_extraction',
      'engine_id', v_cap->>'engine_byte',
      'tasks', coalesce((select jsonb_agg(jsonb_build_object(
          'id', t.id, 'lane', t.lane, 'status', t.status, 'engine_id', t.engine_id,
          'version_n', t.version_n, 'attempt_count', t.attempt_count,
          'error_code', t.error_code, 'finished_at', t.finished_at)
          order by t.created_at, t.id)
        from clara.document_processing_tasks t
        where t.document_id = d.id and t.firm_id = d.firm_id), '[]'::jsonb)),

    -- FACTS. What was actually persisted, at which source version, with which checks.
    'facts', jsonb_build_object(
      'capability', v_cap->>'typed_facts',
      'limits', v_cap->'limits',
      'extractions', coalesce((select jsonb_agg(jsonb_build_object(
          'id', e.id, 'engine_kind', e.engine_kind, 'engine_id', e.engine_id,
          'version_n', e.version_n, 'status', e.status, 'superseded_by', e.superseded_by,
          'extracted_at', e.extracted_at,
          'region_count', (select count(*) from clara.document_regions r where r.extraction_id = e.id))
          order by e.engine_kind, e.version_n)
        from clara.document_extractions e
        where e.document_id = d.id and e.firm_id = d.firm_id
          and e.engine_kind in ('invoice_facts','llm_text_facts','llm_vision_facts','statement_facts')),
        '[]'::jsonb),
      -- THE CURRENT VERDICT PER (subject, check), never the whole history. Rows are append-only
      -- and REVISIONED (S7a-bis appends a revision when a later identity region moves the
      -- verdict), so an unfiltered read would show a document two contradicting rows for one
      -- check and leave the surface to guess. `distinct on` takes the highest revision; the
      -- earlier measurements stay on file and are still readable by anything that wants the
      -- history. NULLs group as equal in `distinct on`, which is exactly right here: a row has
      -- either an extraction_id or a statement_id (ck_document_fact_validations_subject), so the
      -- pair identifies the subject. The projected shape is UNCHANGED -- no `revision` key -- so
      -- no reader of this door had to change for the revision to exist.
      'validations', coalesce((select jsonb_agg(jsonb_build_object(
          'check_name', v.check_name, 'outcome', v.outcome, 'detail', v.detail,
          'extraction_id', v.extraction_id, 'statement_id', v.statement_id,
          'engine_id', v.engine_id, 'evaluated_at', v.evaluated_at)
          order by v.check_name, v.evaluated_at)
        from (select distinct on (fv.extraction_id, fv.statement_id, fv.check_name)
                     fv.check_name, fv.outcome, fv.detail, fv.extraction_id, fv.statement_id,
                     fv.engine_id, fv.evaluated_at
                from clara.document_fact_validations fv
               where fv.document_id = d.id and fv.firm_id = d.firm_id
               order by fv.extraction_id, fv.statement_id, fv.check_name, fv.revision desc) v),
        '[]'::jsonb)),

    -- OPERATION. What the books actually did with it, and whether they could.
    'operation', jsonb_build_object(
      'capability', v_cap->>'business_operation',
      'codeable_kind', clara._is_codeable_kind(d.document_kind),
      'entries', coalesce((select jsonb_agg(distinct jsonb_build_object(
          'entry_id', je.id, 'status', je.status)) from clara.journal_entries je
        where je.firm_id = d.firm_id and je.document_id = d.id), '[]'::jsonb),
      'statements', coalesce((select jsonb_agg(jsonb_build_object(
          'statement_id', bs.id, 'status', bs.status, 'period_start', bs.period_start,
          'period_end', bs.period_end, 'line_count', bs.line_count) order by bs.period_end)
        from clara.bank_statements bs
        where bs.firm_id = d.firm_id and bs.document_id = d.id), '[]'::jsonb)),

    -- LINEAGE. Original, duplicate, refile and supersede -- read TOGETHER for the first time.
    'lineage', jsonb_build_object(
      'sha256', d.sha256,
      'intakes', coalesce((select jsonb_agg(jsonb_build_object(
          'id', i.id, 'status', i.status, 'origin', i.origin,
          'original_filename', i.original_filename, 'created_at', i.created_at)
          order by i.created_at)
        from clara.document_intakes i
        where i.firm_id = d.firm_id and i.document_id = d.id), '[]'::jsonb),
      'filings', coalesce((select jsonb_agg(jsonb_build_object(
          'id', f.id, 'client_id', f.client_id, 'filed_at', f.filed_at, 'basis', f.basis,
          'retired_at', f.retired_at, 'retirement_reason', f.retirement_reason,
          'correction_id', f.correction_id) order by f.filed_at)
        from clara.document_filings f
        where f.firm_id = d.firm_id and f.document_id = d.id), '[]'::jsonb),
      'corrections', coalesce((select jsonb_agg(jsonb_build_object(
          'id', fc.id, 'status', fc.status, 'from_client', fc.from_client,
          'to_client', fc.to_client, 'proposed_at', fc.proposed_at,
          'approved_at', fc.approved_at, 'completed_at', fc.completed_at) order by fc.proposed_at)
        from clara.filing_corrections fc
        where fc.firm_id = d.firm_id and fc.document_id = d.id), '[]'::jsonb),
      'authoritative_extraction_id', d.authoritative_extraction_id))
  into v_result;
  return v_result;
end $fn$;
revoke all on function clara.get_document_state(uuid,uuid) from public;
alter function clara.get_document_state(uuid,uuid) owner to clara_fn_owner;
comment on function clara.get_document_state(uuid,uuid) is
  'The four INDEPENDENT document states -- custody, byte extraction, facts, operation -- plus the capability registry''s verdict for this (format, kind) and the document''s original/duplicate/refile/supersede lineage, read together. Admission mirrors clara.get_document_extract exactly; a document this caller may not read returns NULL (#624).';

reset role;

grant execute on function clara.get_document_state(uuid,uuid) to clara_authenticated, clara_agent_ro;

-- =====================================================================================
-- TAIL CENSUS -- re-read the live catalog and say what is actually there.
-- =====================================================================================
do $dcr_tail$
declare
  v_kinds text[]; v_rows int; v_formats int; v_expected int;
  v_missing text[]; v_extra text[];
  v_pol int; v_forced boolean; v_enabled boolean; v_role text; v_priv text; v_ix text;
  v_path text; v_bad text[]; v_survivors text[]; v_census int := 0; v_refused int := 0;
  v_cap jsonb;
  v_probe record; v_sig text;
begin
  -- (1) TOTALITY, BOTH DIRECTIONS, against the vocabulary derived from the live CHECK.
  v_kinds := clara._document_kind_roster();
  select count(*)::int, count(distinct format)::int into v_rows, v_formats from clara.document_capabilities;
  v_expected := coalesce(array_length(v_kinds, 1), 0) * v_formats;
  if v_rows <> v_expected then
    raise exception 'dcr tail: expected % rows (% kinds x % formats), found %', v_expected,
      coalesce(array_length(v_kinds, 1), 0), v_formats, v_rows using errcode = 'CLR10';
  end if;
  if v_formats <> 12 then
    raise exception 'dcr tail: expected the 12 canonical intake formats, found %', v_formats using errcode = 'CLR10';
  end if;
  select array_agg(k order by k) into v_missing from unnest(v_kinds) k
   where not exists (select 1 from clara.document_capabilities c where c.document_kind = k);
  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'dcr tail: the vocabulary admits kind(s) % the registry does not name', v_missing using errcode = 'CLR10';
  end if;
  select array_agg(distinct c.document_kind order by c.document_kind) into v_extra
    from clara.document_capabilities c where not (c.document_kind = any (v_kinds));
  if coalesce(array_length(v_extra, 1), 0) > 0 then
    raise exception 'dcr tail: the registry names kind(s) % the vocabulary does not admit', v_extra using errcode = 'CLR10';
  end if;

  -- (2) ONE MIME PER FORMAT, and custody/byte_extraction FORMAT-invariant.
  if exists (select 1 from clara.document_capabilities
              group by format having count(distinct mime_type) > 1
                 or count(distinct custody) > 1 or count(distinct byte_extraction) > 1
                 or count(distinct engine_byte) > 1) then
    raise exception 'dcr tail: a format carries more than one mime / custody / byte_extraction / byte engine'
      using errcode = 'CLR10';
  end if;

  -- (3) THE VERDICTS THE HEADER CLAIMS, asserted individually. A count would be satisfied by the
  -- wrong rows.
  if (clara._document_capability('ofx','bank_statement')->>'typed_facts') = 'supported' then
    raise exception 'dcr tail: ofx x bank_statement reads facts-SUPPORTED -- C-37''s headline finding is inverted'
      using errcode = 'CLR10';
  end if;
  if (clara._document_capability('ofx','bank_statement')->>'byte_extraction') <> 'stored_only' then
    raise exception 'dcr tail: ofx byte_extraction is not stored_only -- the intake lane map moved'
      using errcode = 'CLR10';
  end if;
  if (clara._document_capability('csv','bank_statement')->>'typed_facts') <> 'supported' then
    raise exception 'dcr tail: csv x bank_statement is not facts-supported -- the statement_parse lane is live'
      using errcode = 'CLR10';
  end if;
  if (clara._document_capability('pdf','invoice')->>'typed_facts') <> 'supported'
     or (clara._document_capability('pdf','invoice')->'limits'->>'invoice_line_items') <> 'planned' then
    raise exception 'dcr tail: the invoice pair lost either its facts support or its line-item limit'
      using errcode = 'CLR10';
  end if;
  if (clara._document_capability('pdf','payroll_summary')->>'business_operation') = 'supported' then
    raise exception 'dcr tail: a skipped_kind pair reads operation-SUPPORTED -- acceptance 1 is violated'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.document_capabilities
              where document_kind = 'consent_evidence'
                and (typed_facts <> 'unsupported' or business_operation <> 'unsupported')) then
    raise exception 'dcr tail: consent_evidence is not facts/operation-unsupported on every format (H-53)'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.document_capabilities
              where business_operation = 'supported' and typed_facts <> 'supported') then
    raise exception 'dcr tail: an operation is promised over facts that do not exist' using errcode = 'CLR10';
  end if;
  -- The two honest defaults.
  v_cap := clara._document_capability('zzz_not_a_format','invoice');
  if (v_cap->>'typed_facts') <> 'unsupported' or (v_cap->>'known_pair')::boolean then
    raise exception 'dcr tail: an unknown pair does not read unsupported' using errcode = 'CLR10';
  end if;
  v_cap := clara._document_capability('pdf', null);
  if (v_cap->>'kind_known')::boolean or (v_cap->>'typed_facts') <> 'unsupported'
     or (v_cap->>'byte_extraction') <> 'supported' then
    raise exception 'dcr tail: a not-yet-classified pdf does not read honestly' using errcode = 'CLR10';
  end if;

  -- (4) THE GRAMMAR, THROUGH THE FUNCTION. Every censused producer path passes; the malformed
  -- shapes are refused. The prestate ran the same census inline against stored rows, so the two
  -- derivations are proven to agree before this file commits.
  v_survivors := array[]::text[];
  foreach v_path in array array[
      'pages.1.lines.0','pages.17.lines.412','tables.0.cells.3','tables.12.cells.980',
      'rows.0','rows.19999','sheets.0.A1','sheets.11.AA128','sheets.0.cell_1','paragraphs.0',
      'myinvois.supplier_tin','myinvois.supplier_brn','myinvois.buyer_id_primary',
      'myinvois.buyer_id_secondary','opening_tb.line','prior_gl.line',
      'invoice.total','invoice.amount_due','invoice.currency','invoice.vendor_name',
      'invoice.invoice_id','invoice.invoice_date','invoice.deposit','invoice.total_excl_tax',
      'invoice.tax_total','invoice.rounding','invoice.service_charge','invoice.discount',
      'invoice.delivery','invoice.type_code','invoice.customer_name',
      'invoice.customer_registration','invoice.customer_taxid','invoice.vendor_registration',
      'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid',
      'invoice.contact_person','invoice.grand_total','statement.closing_balance'] loop
    v_census := v_census + 1;
    begin
      perform clara._assert_field_path(v_path);
    exception when others then
      v_survivors := v_survivors || v_path;
    end;
  end loop;
  if coalesce(array_length(v_survivors, 1), 0) > 0 then
    raise exception 'dcr tail: the grammar REFUSES live producer path(s) % -- that is an ingest outage, not a wall', v_survivors
      using errcode = 'CLR10';
  end if;
  perform clara._assert_field_path(null);   -- a nullable column's null must pass

  v_bad := array[]::text[];
  foreach v_path in array array['invoice..total','Invoice.Total','.invoice.total','invoice.total.',
      'evil.total','invoice.tot al','pages.1.lines.0.<script>', repeat('a', 200),
      'invoice.' || repeat('a.', 20) || 'z'] loop
    v_refused := v_refused + 1;
    begin
      perform clara._assert_field_path(v_path);
      v_bad := v_bad || v_path;
    exception when others then
      null;
    end;
  end loop;
  if coalesce(array_length(v_bad, 1), 0) > 0 then
    raise exception 'dcr tail: the grammar ACCEPTS malformed path(s) %', v_bad using errcode = 'CLR10';
  end if;

  -- (5) RLS AND GRANTS, read from the catalog and not from this file's own text.
  --
  -- THE EXPECTED POLICY COUNT DIFFERS BY TABLE, and the difference is the design rather than an
  -- inconsistency. clara.document_capabilities is a GLOBAL vocabulary with no tenant column: its
  -- read predicate is `true`, and the ONE application lane holding the table is the human one
  -- (the agent lane reads the registry through the definer doors -- see S1 and sweep (5b) below),
  -- so owner + human read is TWO. clara.document_fact_validations is firm-scoped, so it takes the
  -- estate's per-lane shape (0007:788-791) -- jwt_firm() for the human lane, wake_firm() for the
  -- agent lane, each measured ROW-WISE by document-fact-validation-belt.test.mjs rather than
  -- counted -- and carries THREE.
  --
  -- THE WRITE SWEEP IS SYMMETRIC ACROSS ALL THREE APPLICATION ROLES. The first cut checked
  -- INSERT/UPDATE/DELETE for clara_authenticated but only INSERT for clara_agent_ro and nothing
  -- at all for clara_runtime -- so a stray UPDATE grant to the lane that PRODUCES the facts would
  -- have passed the very sweep written to catch it. Driven off arrays now, so a fourth role or a
  -- fourth privilege is one word rather than a new conjunct nobody remembers to add.
  for v_probe in select * from (values
      ('document_capabilities', 2), ('document_fact_validations', 3)) as t(t, want_pol) loop
    select c.relrowsecurity, c.relforcerowsecurity into v_enabled, v_forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relname = v_probe.t;
    if not v_enabled or not v_forced then
      raise exception 'dcr tail: clara.% RLS enabled=% forced=% -- both must be true', v_probe.t, v_enabled, v_forced
        using errcode = 'CLR10';
    end if;
    select count(*)::int into v_pol from pg_policies where schemaname = 'clara' and tablename = v_probe.t;
    if v_pol <> v_probe.want_pol then
      raise exception 'dcr tail: clara.% carries % policies, expected %', v_probe.t, v_pol, v_probe.want_pol
        using errcode = 'CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime'] loop
      foreach v_priv in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
        if pg_catalog.has_table_privilege(v_role, 'clara.' || v_probe.t, v_priv) then
          raise exception 'dcr tail: % holds % on clara.% -- every write to these tables goes through a definer trigger body, never a role', v_role, v_priv, v_probe.t
            using errcode = 'CLR10';
        end if;
      end loop;
    end loop;
    -- THE READ LANES, PER TABLE. The human lane holds SELECT on both. The agent lane holds it on
    -- the firm-scoped validations table (its own wake_firm() policy is what scopes it) and NOT on
    -- the global registry, which it reads through the definer doors instead -- sweep (5b) below
    -- asserts that side in both directions.
    if not pg_catalog.has_table_privilege('clara_authenticated', 'clara.' || v_probe.t, 'SELECT') then
      raise exception 'dcr tail: the human read lane cannot SELECT clara.%', v_probe.t using errcode = 'CLR10';
    end if;
    if v_probe.t = 'document_fact_validations'
       and not pg_catalog.has_table_privilege('clara_agent_ro', 'clara.' || v_probe.t, 'SELECT') then
      raise exception 'dcr tail: the agent read lane cannot SELECT clara.% -- its wake_firm() policy then scopes nothing', v_probe.t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (5b) THE AGENT LANE REACHES THE REGISTRY THROUGH A DOOR, NEVER THROUGH THE TABLE -- 0165's
  -- own ruling for clara.document_kind_codeability, asserted here in both directions so neither
  -- half can rot. A table grant restored by a later file fails the FIRST clause; a door revoked
  -- out from under the lane (which would leave the agent unable to read what it cannot do, the
  -- very thing this registry exists to publish) fails the SECOND.
  if pg_catalog.has_table_privilege('clara_agent_ro', 'clara.document_capabilities', 'SELECT') then
    raise exception 'dcr tail: clara_agent_ro holds SELECT on clara.document_capabilities -- the agent lane reads this global vocabulary through clara._document_capability / clara.get_document_state, never off the table (0165''s ruling)'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'clara' and tablename = 'document_capabilities'
                and 'clara_agent_ro' = any (roles)) then
    raise exception 'dcr tail: a clara.document_capabilities policy still names clara_agent_ro -- a policy for a role with no grant measures nothing'
      using errcode = 'CLR10';
  end if;
  foreach v_sig in array array['clara._document_capability(text,text)','clara._document_format(text)','clara.get_document_state(uuid,uuid)'] loop
    if not pg_catalog.has_function_privilege('clara_agent_ro', v_sig, 'EXECUTE') then
      raise exception 'dcr tail: clara_agent_ro cannot EXECUTE % -- with no table grant this is the lane''s only path to the registry', v_sig
        using errcode = 'CLR10';
    end if;
    if (select prosecdef from pg_proc where oid = v_sig::regprocedure) is not true then
      raise exception 'dcr tail: % is not SECURITY DEFINER -- an invoker-rights door cannot read a table the caller holds no grant on', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (6) THE THREE CONSTRAINT TRIGGERS EXIST AND ARE DEFERRED. A trigger that fired immediately
  -- would read an extraction whose regions have not landed yet and record `unmeasured` for every
  -- invoice in the estate -- a silently wrong answer, which is the worst kind. The THIRD is the
  -- region-side belt: parent-only would be structurally blind to a lone later child insert
  -- (0038:2300-2305), which was measured as ACCEPTED before this file closed it.
  --
  -- AND THE BELT REFUSES NOTHING, pinned on its own body rather than on its name. S7a-bis appends
  -- a revision where the first cut of this file raised CLR10 `fact_validation_would_go_stale`; a
  -- future edit that reinstated the refusal would pass every other assertion in this tail while
  -- turning a correct write back into a failure, so the body is read: it must carry no
  -- `raise exception` at all, and it must carry the append. `revision` and its place in the unique
  -- key are pinned with it, because the append is meaningless without them.
  for v_probe in select * from (values
      ('t_document_extractions_fact_validate', 'clara.document_extractions'),
      ('t_bank_statements_fact_validate',      'clara.bank_statements'),
      ('t_document_regions_fact_validate',     'clara.document_regions')) as t(tg, rel) loop
    if not exists (select 1 from pg_trigger
                    where tgname = v_probe.tg and tgrelid = v_probe.rel::regclass
                      and tgdeferrable and tginitdeferred) then
      raise exception 'dcr tail: % on % is missing or is not DEFERRABLE INITIALLY DEFERRED', v_probe.tg, v_probe.rel
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'clara' and p.proname = '_tf_document_region_fact_validate')
      ~ 'raise\s+exception' then
    raise exception 'dcr tail: clara._tf_document_region_fact_validate raises -- the region-side belt APPENDS a revision, it never refuses a write (the refusal cost 291 db cells at wave-2 integration)'
      using errcode = 'CLR10';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'clara' and p.proname = '_tf_document_region_fact_validate')
      !~ 'insert into clara\.document_fact_validations' then
    raise exception 'dcr tail: clara._tf_document_region_fact_validate no longer appends -- a later region that moves the invoice identity would leave the recorded verdict stale'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.document_fact_validations'::regclass
                    and a.attname = 'revision' and a.attnum > 0 and not a.attisdropped) then
    raise exception 'dcr tail: clara.document_fact_validations has no `revision` column -- the append-only revision law has nothing to stand on'
      using errcode = 'CLR10';
  end if;
  foreach v_ix in array array['uq_document_fact_validations_extraction',
                              'uq_document_fact_validations_statement'] loop
    if pg_catalog.pg_get_indexdef(('clara.' || v_ix)::regclass) not like '%revision%' then
      raise exception 'dcr tail: % does not carry `revision` -- an appended revision would collide with the measurement it supersedes', v_ix
        using errcode = 'CLR10';
    end if;
  end loop;

  -- …and the statement side's own child-table belt, which this file RELIES ON rather than
  -- duplicating: 0038 attached `_tf_bank_statement_belt` to clara.bank_statement_lines, and that
  -- is what makes a lone later line impossible. If it ever leaves, the invariant this file's
  -- header states stops being true on the statement side and nothing else here would notice.
  if not exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
                  where g.tgrelid = 'clara.bank_statement_lines'::regclass
                    and p.proname = '_tf_bank_statement_belt' and not g.tgisinternal) then
    raise exception 'dcr tail: 0038''s statement belt is no longer attached to clara.bank_statement_lines -- the child-side invariant this file documents is unenforced'
      using errcode = 'CLR10';
  end if;

  -- (7) EXECUTE grants on the four new readers.
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara.get_document_state(uuid,uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('clara_agent_ro', 'clara.get_document_state(uuid,uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('clara_authenticated', 'clara._document_capability(text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('clara_agent_ro', 'clara._document_capability(text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('clara_authenticated', 'clara._document_format(text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('clara_authenticated', 'clara._assert_field_path(text)', 'EXECUTE') then
    raise exception 'dcr tail: a new reader is not executable by the lanes that must reach it' using errcode = 'CLR10';
  end if;

  raise notice 'dcr tail: OK -- clara.document_capabilities holds % rows, TOTAL over % derived kinds x % canonical intake formats in BOTH directions, one mime/custody/byte-engine per format, one registry_version. ofx x bank_statement reads byte_extraction=stored_only and typed_facts<>supported (the measured OFX finding); csv x bank_statement reads supported; a skipped_kind pair never reads operation-supported; consent_evidence is unsupported everywhere. clara._assert_field_path accepts all % censused producer paths and NULL, refuses % malformed shapes, and is spliced into clara.persist_document_extraction ONCE with owner/ACL/DEFINER/search_path and every pre-existing gate carried verbatim. clara.document_fact_validations is append-only and REVISIONED behind THREE DEFERRABLE INITIALLY DEFERRED constraint triggers (two recorders on the header tables plus the region-side belt, which re-derives at commit and APPENDS the next revision when a later identity region moves the verdict -- it raises nothing, asserted on its own body -- while readers take the highest revision), so no live persist body was recut; 0038''s own belt on clara.bank_statement_lines is asserted present because the statement half of that law, which keeps the stricter refusal, rests on it. Both new tables are forced-RLS with no application write grant: the registry carries owner + HUMAN read and clara_agent_ro holds no table privilege on it at all -- the agent lane reaches it only through the SECURITY DEFINER doors clara._document_capability / clara._document_format / clara.get_document_state, which is 0165''s own ruling for clara.document_kind_codeability; the validations table keeps the per-lane pair (jwt_firm / wake_firm). No table in workflow/graphile_worker/spike touched.',
    v_rows, coalesce(array_length(v_kinds, 1), 0), v_formats, v_census, v_refused;
end $dcr_tail$;
