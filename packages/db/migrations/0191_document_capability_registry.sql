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
-- (`sheets.0.A1` -- structured-worker.mjs interpolates the XLSX `r=` attribute verbatim), so a
-- lowercase-only grammar would have refused the hot OCR and XLSX ingest paths on the first real
-- upload. The accepted shape is stated in clara._assert_field_path's own comment, and the tail
-- probe below runs every censused producer path through it.
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
  foreach v_def in array array['clara_fn_owner','clara_authenticated','clara_agent_ro'] loop
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
  if coalesce(array_length(v_bad, 1), 0) > 0 then
    raise exception 'dcr prestate: % stored field_path value(s) would be refused by the new grammar (first ten: %) -- a live producer emits a shape this file has not been taught; census it and widen the roster before retrying',
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
-- SELECT-only verb and the absent write grant. BOTH application read lanes are admitted: the
-- workbench renders the registry, and the agent lane must be able to read what it cannot do.
create policy p_document_capabilities_read on clara.document_capabilities
  for select to clara_authenticated, clara_agent_ro using (true);

reset role;

grant select on clara.document_capabilities to clara_authenticated, clara_agent_ro;

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
-- on the hot OCR path, and packages/runtime/lib/structured-worker.mjs emits `sheets.0.A1` --
-- the XLSX `r=` attribute interpolated verbatim, so uppercase column letters are ordinary. A
-- lowercase-only grammar would have refused both lanes on the first real upload. What the
-- grammar DOES refuse is everything that is not a path at all: empty segments, whitespace,
-- statement terminators, traversal shapes, markup, an unbounded length, and -- the term that
-- carries the most weight -- a first segment no producer in this estate owns.
--
-- THE NAMESPACE ROSTER IS CENSUSED, not speculative. Ten namespaces, each with a named producer:
--   pages, tables        -- egress.mjs normalizeAzureLayout (the `ocr` lane)
--   rows, sheets, paragraphs -- structured-worker.mjs parseCsv / parseXlsx / parseDocx
--   myinvois             -- myinvois.mjs parseUblIdentity
--   opening_tb           -- opening-tb-cells.mjs
--   prior_gl             -- seeding-parse.mjs's prior-GL regions
--   invoice              -- persist_invoice_facts' closed seven, persist_witness_facts' belt +
--                           optional arrays, and myinvois.mjs mapFactsFields
--   statement            -- the statement vocabulary the web extract surface labels
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
-- two DEFERRABLE CONSTRAINT TRIGGERS that fire AT COMMIT, by which time the facts rows AND their
-- regions are all present in the same transaction the persist ran in. One object per family,
-- every writer covered, and not one line of a live persist body touched.
--
-- APPEND-ONLY. A validation is a measurement taken at a moment; it is never updated or deleted.
-- The unique key is (extraction_id, check_name) for the invoice family and
-- (statement_id, check_name) for the statement family, so a replayed persist cannot double-write.
--
-- BLOCKING IS NOT THIS TABLE'S JOB. A `fail` row does not stop the facts from being readable and
-- does not by itself stop anything: clara._invoice_fact_state's own verdict already governs what
-- dependent work may proceed. This table makes the reason VISIBLE.
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
  evaluated_at  timestamptz not null default now(),
  constraint ck_document_fact_validations_subject
    check ((extraction_id is not null) <> (statement_id is not null)),
  constraint fk_document_fact_validations_document
    foreign key (document_id, firm_id) references clara.documents(id, firm_id) on delete cascade
);

create unique index uq_document_fact_validations_extraction
  on clara.document_fact_validations(extraction_id, check_name) where extraction_id is not null;
create unique index uq_document_fact_validations_statement
  on clara.document_fact_validations(statement_id, check_name) where statement_id is not null;
create index ix_document_fact_validations_document
  on clara.document_fact_validations(firm_id, document_id, evaluated_at desc);

comment on table clara.document_fact_validations is
  'One append-only row per (facts extraction | bank statement) x named arithmetic check: pass / fail / not_applicable / unmeasured, with the terms in `detail`. Written by two deferrable constraint triggers at commit, so no live persist body was recut to record them. A fail row does NOT block: clara._invoice_fact_state remains the authority over dependent work; this table makes the reason visible on the document surface (#624).';
comment on column clara.document_fact_validations.outcome is
  'pass = the check ran and held. fail = it ran and did not. not_applicable = the check cannot apply to this source (a format with no printed totals). unmeasured = the terms the check needs were not all persisted, so no verdict is possible -- deliberately distinct from pass.';

alter table clara.document_fact_validations enable row level security;
alter table clara.document_fact_validations force row level security;

create policy p_document_fact_validations_owner on clara.document_fact_validations
  for all to clara_fn_owner using (true) with check (true);
create policy p_document_fact_validations_read on clara.document_fact_validations
  for select to clara_authenticated, clara_agent_ro
  using (firm_id = clara.actor_firm_id());

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

create function clara._tf_document_fact_validate() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_total bigint; v_net bigint; v_tax bigint;
  v_sc bigint; v_disc bigint; v_dlv bigint; v_round bigint;
  v_outcome text; v_residual bigint;
begin
  if new.status <> 'done' or new.engine_kind not in ('invoice_facts','llm_text_facts') then
    return null;
  end if;
  select
    max(monetary_cents) filter (where field_path = 'invoice.total'),
    max(monetary_cents) filter (where field_path = 'invoice.total_excl_tax'),
    max(monetary_cents) filter (where field_path = 'invoice.tax_total'),
    max(monetary_cents) filter (where field_path = 'invoice.service_charge'),
    max(monetary_cents) filter (where field_path = 'invoice.discount'),
    max(monetary_cents) filter (where field_path = 'invoice.delivery'),
    max(monetary_cents) filter (where field_path = 'invoice.rounding')
    into v_total, v_net, v_tax, v_sc, v_disc, v_dlv, v_round
    from clara.document_regions where extraction_id = new.id;

  if v_total is null then return null; end if;   -- nothing monetary landed: no claim to make

  if v_net is null or v_tax is null then
    v_outcome := 'unmeasured';
    v_residual := null;
  else
    v_residual := (v_net + coalesce(v_sc,0) + coalesce(v_dlv,0) + v_tax + coalesce(v_round,0)
                   - coalesce(v_disc,0)) - v_total;
    v_outcome := case when v_residual = 0 then 'pass' else 'fail' end;
  end if;

  insert into clara.document_fact_validations(firm_id, document_id, extraction_id, check_name,
      outcome, engine_id, detail)
  values (new.firm_id, new.document_id, new.id, 'invoice.six_term_identity', v_outcome, new.engine_id,
    jsonb_strip_nulls(jsonb_build_object(
      'total_cents', v_total, 'total_excl_tax_cents', v_net, 'tax_total_cents', v_tax,
      'service_charge_cents', v_sc, 'discount_cents', v_disc, 'delivery_cents', v_dlv,
      'rounding_cents', v_round, 'residual_cents', v_residual,
      'identity', 'total_excl_tax + service_charge + delivery + tax_total + rounding - discount = total',
      'note', case when v_outcome = 'unmeasured'
                   then 'the net and tax terms were not persisted as cents by this regime, so the identity cannot be evaluated'
              end)))
  on conflict do nothing;
  return null;
end $fn$;
revoke all on function clara._tf_document_fact_validate() from public;
alter function clara._tf_document_fact_validate() owner to clara_fn_owner;
comment on function clara._tf_document_fact_validate() is
  'Deferred constraint-trigger body: records the invoice six-term identity for a done invoice_facts/llm_text_facts extraction at COMMIT, when its regions are all present. Writes pass/fail/unmeasured; never raises, never blocks (#624).';

create constraint trigger t_document_extractions_fact_validate
  after insert on clara.document_extractions
  deferrable initially deferred
  for each row execute function clara._tf_document_fact_validate();

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
  values (new.firm_id, new.document_id, new.id, 'statement.chain_closes',
    case when new.opening_cents is null or new.closing_cents is null then 'unmeasured'
         when new.opening_cents + v_sum = new.closing_cents then 'pass' else 'fail' end,
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
      'validations', coalesce((select jsonb_agg(jsonb_build_object(
          'check_name', v.check_name, 'outcome', v.outcome, 'detail', v.detail,
          'extraction_id', v.extraction_id, 'statement_id', v.statement_id,
          'engine_id', v.engine_id, 'evaluated_at', v.evaluated_at)
          order by v.check_name, v.evaluated_at)
        from clara.document_fact_validations v
        where v.document_id = d.id and v.firm_id = d.firm_id), '[]'::jsonb)),

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
  v_pol int; v_forced boolean; v_enabled boolean;
  v_path text; v_bad text[]; v_survivors text[];
  v_cap jsonb;
  v_probe record;
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
      'rows.0','rows.19999','sheets.0.A1','sheets.11.AA128','sheets.0.C1','paragraphs.0',
      'myinvois.supplier_tin','myinvois.supplier_brn','myinvois.buyer_id_primary',
      'myinvois.buyer_id_secondary','opening_tb.line','prior_gl.line',
      'invoice.total','invoice.amount_due','invoice.currency','invoice.vendor_name',
      'invoice.invoice_id','invoice.invoice_date','invoice.deposit','invoice.total_excl_tax',
      'invoice.tax_total','invoice.rounding','invoice.service_charge','invoice.discount',
      'invoice.delivery','invoice.type_code','invoice.customer_name',
      'invoice.customer_registration','invoice.customer_taxid','invoice.vendor_registration',
      'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.contact_person',
      'invoice.grand_total','statement.closing_balance'] loop
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
  for v_probe in select unnest(array['document_capabilities','document_fact_validations']) as t loop
    select c.relrowsecurity, c.relforcerowsecurity into v_enabled, v_forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relname = v_probe.t;
    if not v_enabled or not v_forced then
      raise exception 'dcr tail: clara.% RLS enabled=% forced=% -- both must be true', v_probe.t, v_enabled, v_forced
        using errcode = 'CLR10';
    end if;
    select count(*)::int into v_pol from pg_policies where schemaname = 'clara' and tablename = v_probe.t;
    if v_pol <> 2 then
      raise exception 'dcr tail: clara.% carries % policies, expected 2 (owner ALL + application SELECT)', v_probe.t, v_pol
        using errcode = 'CLR10';
    end if;
    if pg_catalog.has_table_privilege('clara_authenticated', 'clara.' || v_probe.t, 'INSERT')
       or pg_catalog.has_table_privilege('clara_authenticated', 'clara.' || v_probe.t, 'UPDATE')
       or pg_catalog.has_table_privilege('clara_authenticated', 'clara.' || v_probe.t, 'DELETE')
       or pg_catalog.has_table_privilege('clara_agent_ro', 'clara.' || v_probe.t, 'INSERT') then
      raise exception 'dcr tail: an application role holds a WRITE privilege on clara.%', v_probe.t using errcode = 'CLR10';
    end if;
    if not pg_catalog.has_table_privilege('clara_authenticated', 'clara.' || v_probe.t, 'SELECT')
       or not pg_catalog.has_table_privilege('clara_agent_ro', 'clara.' || v_probe.t, 'SELECT') then
      raise exception 'dcr tail: an application read lane cannot SELECT clara.%', v_probe.t using errcode = 'CLR10';
    end if;
  end loop;

  -- (6) THE TWO CONSTRAINT TRIGGERS EXIST AND ARE DEFERRED. A trigger that fired immediately
  -- would read an extraction whose regions have not landed yet and record `unmeasured` for every
  -- invoice in the estate -- a silently wrong answer, which is the worst kind.
  if not exists (select 1 from pg_trigger where tgname = 't_document_extractions_fact_validate'
                   and tgrelid = 'clara.document_extractions'::regclass and tgdeferrable and tginitdeferred)
     or not exists (select 1 from pg_trigger where tgname = 't_bank_statements_fact_validate'
                   and tgrelid = 'clara.bank_statements'::regclass and tgdeferrable and tginitdeferred) then
    raise exception 'dcr tail: a fact-validation trigger is missing or is not DEFERRABLE INITIALLY DEFERRED'
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

  raise notice 'dcr tail: OK -- clara.document_capabilities holds % rows, TOTAL over % derived kinds x % canonical intake formats in BOTH directions, one mime/custody/byte-engine per format, one registry_version. ofx x bank_statement reads byte_extraction=stored_only and typed_facts<>supported (the measured OFX finding); csv x bank_statement reads supported; a skipped_kind pair never reads operation-supported; consent_evidence is unsupported everywhere. clara._assert_field_path accepts all 39 censused producer paths and NULL, refuses 9 malformed shapes, and is spliced into clara.persist_document_extraction ONCE with owner/ACL/DEFINER/search_path and every pre-existing gate carried verbatim. clara.document_fact_validations is append-only behind two DEFERRABLE INITIALLY DEFERRED constraint triggers, so no live persist body was recut. Both new tables are forced-RLS with exactly two policies and no application write grant. No table in workflow/graphile_worker/spike touched.',
    v_rows, coalesce(array_length(v_kinds, 1), 0), v_formats;
end $dcr_tail$;
