-- 0245_invoice_line_items_accepted_limitation — #782: INVOICE LINE ITEMS STOP BEING "PLANNED"
-- AND BECOME A NAMED, PERMANENT LIMITATION.
-- =====================================================================================
-- Spec of record: issue #782, owner ruling 2026-09-18 ("Owner ruling (2026-09-18 review): no
-- invoice line items this round; stop promising them"). #782's own newest Agent Brief:
--
--   "The capability registry's named limit for the invoice family says line items are an
--    accepted limitation with its reason, not `planned`; every user-visible sentence built from
--    that limit ... says the same ... No reading, drafting or posting behaviour changes."
--
-- and the wave-2 coordination comment on the same ticket, left after #656's
-- 0228_opening_ledger_source.sql republished the WHOLE registry at version 2 (measured on
-- hosted: 240 rows, one distinct version, min = max = 2 on 2026-09-19):
--
--   "raise the whole registry from 2 to 3 (registry_version = registry_version + 1 over every
--    row), never DELETE-then-INSERT ... 0207's BEFORE UPDATE wall refuses only a DECREASE ...
--    raising the version, and leaving it unchanged while another column moves, both still
--    succeed, so the wall alone will not catch a republication that forgets to raise. The rule
--    that does catch it is the registry's one-version law:
--    packages/db/tests/document-capability-registry.test.mjs:223-229 asserts
--    count(distinct registry_version) = 1 over the 240 rows."
--
-- Since that comment was written, #846 (this lane's own prior ticket, 0244_document_capability_
-- version_high_water.sql) turned BOTH of those into database refusals rather than conventions:
-- a BEFORE INSERT wall + an append-only high-water mark close the DELETE-then-INSERT hole, and a
-- DEFERRABLE INITIALLY DEFERRED constraint trigger now refuses a transaction that LEAVES more
-- than one distinct registry_version at commit. This file's whole-registry raise is therefore
-- proven twice over: by the live test file (unchanged cells) AND by the database itself.
--
-- PARENT FILES, NONE EDITED HERE: 0191_document_capability_registry.sql (the table, the seed,
-- the `{"invoice_line_items":"planned"}` limit), 0207_document_capabilities_version_monotone.sql
-- (the BEFORE UPDATE wall), 0228_opening_ledger_source.sql (the precedent republication, 1 -> 2),
-- 0244_document_capability_version_high_water.sql (the high-water mark + the uniformity wall,
-- this lane's own #846).
--
-- THIS FILE CREATES NO FUNCTION, NO TABLE, NO COLUMN, NO TRIGGER, NO CHECK, NO POLICY AND NO
-- GRANT, AND IT RECUTS NOTHING. Its whole content is a republication of
-- `clara.document_capabilities` by UPDATE (never DELETE-then-INSERT, #846): a content correction
-- on the 28 invoice-family rows' `limits` only, then the registry-wide version raise every prior
-- republication has used (0228's precedent).
--
-- WHAT "AN ACCEPTED-LIMITATION VALUE CARRYING A REASON" MEANS HERE, MEASURED RATHER THAN
-- ASSERTED. The owner's ruling is that Clara reads and posts invoice facts at HEADER level only,
-- by design, and that this is a permanent boundary rather than a future build. The claim is
-- checkable: `packages/runtime/lib/trade-invoice-basis.ts`'s posting-tool input schemas
-- (`tradeInvoicePartySchema`, `startTradeInvoiceWorkInputSchema`) are `.strict()` throughout and
-- admit no `line_items` field — a model that invented one would be REFUSED by the schema, not
-- silently dropped — and `tradeInvoiceLineSchema`'s own comment says these are "JOURNAL BASIS
-- LINES, never extracted invoice line items". No consumer anywhere in `packages/runtime` reads a
-- per-line invoice fact (grepped: the only hit for `invoice_line_items`/`invoice.line` outside
-- tests and this registry is that one comment). So the limit's value changes from the FUTURE-
-- TENSE `planned` to the STATE word `accepted_limitation`, with a sibling
-- `invoice_line_items_reason` naming the checkable fact rather than a bare verdict — the same
-- two-key shape `limits` already uses for the OFX row (`opening_balance` + `reader`, 0191 §S2).
-- Neither `basis`, `typed_facts` nor `business_operation` moves: Clara's read of invoice HEADER
-- facts and the operation it drives are unchanged, which is the ticket's own "no reading,
-- drafting or posting behaviour changes".
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. Every claim this file makes about what it is building on, measured on the lane
-- rig (127.0.0.1:55743 / clara_l03) on 2026-09-20, never transcribed from another file's text.
-- =====================================================================================
do $w782_pre$
declare
  v_n int; v_sha text; v_before int;
begin
  if to_regclass('clara.document_capabilities') is null then
    raise exception '#782 prestate: clara.document_capabilities is absent -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;

  -- (a) THE REGISTRY PUBLISHES EXACTLY ONE VERSION TODAY, AND IT IS 2 (0228's own raise). A
  -- republication over a registry that is not already uniform would be building on drift.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#782 prestate: the registry publishes % distinct registry_versions, not one'
      , v_n using errcode = 'CLR10';
  end if;
  select min(registry_version)::int into v_before from clara.document_capabilities;
  if v_before <> 2 then
    raise exception '#782 prestate: the registry publishes version %, not the 2 this file raises from'
      , v_before using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities;
  if v_n <> 240 then
    raise exception '#782 prestate: the registry holds % rows, not 240 -- this file inserts and deletes nothing'
      , v_n using errcode = 'CLR10';
  end if;

  -- (b) THE 28 INVOICE-FAMILY ROWS, exactly the pairs 0191 §S2 seeded
  -- `{"invoice_line_items":"planned"}` onto: the six OCR-family formats x
  -- invoice/credit_note/debit_note/receipt (24), plus xml x
  -- invoice/credit_note/debit_note/e_invoice_xml (4).
  select count(*)::int into v_n from clara.document_capabilities
   where limits ->> 'invoice_line_items' = 'planned';
  if v_n <> 28 then
    raise exception '#782 prestate: % row(s) carry limits.invoice_line_items = planned, not the 28 measured on this rig'
      , v_n using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.document_capabilities where limits ? 'invoice_line_items_reason') then
    raise exception '#782 prestate: a row already carries invoice_line_items_reason -- this file would not be the first writer'
      using errcode = 'CLR10';
  end if;

  -- (c) THE WALLS THIS FILE'S RAISE RIDES, PINNED BY BODY -- #846 is this lane's own prior
  -- ticket and may have recut what it landed; pin what is LIVE on this rig now, never
  -- transcribed from 0207's or 0244's file text.
  if to_regprocedure('clara._tf_document_capabilities_version_monotone()') is null then
    raise exception '#782 prestate: clara._tf_document_capabilities_version_monotone is absent -- 0207 must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_monotone()'::regprocedure;
  if v_sha <> '170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56' then
    raise exception '#782 prestate: clara._tf_document_capabilities_version_monotone body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;

  if to_regclass('clara.document_capability_version_high_water') is null then
    raise exception '#782 prestate: clara.document_capability_version_high_water is absent -- 0244 (#846) must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_high_water()'::regprocedure;
  if v_sha <> 'b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9' then
    raise exception '#782 prestate: clara._tf_document_capabilities_version_high_water body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_high_water_record()'::regprocedure;
  if v_sha <> '839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d' then
    raise exception '#782 prestate: clara._tf_document_capabilities_high_water_record body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capability_high_water_monotone()'::regprocedure;
  if v_sha <> '196780f9528d1d74cbef0bbc400024974ebd9828106c1b0fc8f7026652888f27' then
    raise exception '#782 prestate: clara._tf_document_capability_high_water_monotone body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_uniform()'::regprocedure;
  if v_sha <> 'd21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776' then
    raise exception '#782 prestate: clara._tf_document_capabilities_version_uniform body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- (d) THE HIGH-WATER MARK ALREADY AGREES WITH THE REGISTRY -- every pair's mark sits AT its
  -- published version, so this file's raise is the ordinary "raise" path the writer trigger
  -- takes, never a first publication.
  select count(*)::int into v_n
    from clara.document_capabilities c
    left join clara.document_capability_version_high_water h
      on h.format = c.format and h.document_kind = c.document_kind
   where h.format is null or h.registry_version is distinct from c.registry_version;
  if v_n <> 0 then
    raise exception '#782 prestate: % pair(s) carry a high-water mark that disagrees with the published registry'
      , v_n using errcode = 'CLR10';
  end if;

  raise notice '#782 prestate: OK -- registry publishes version 2 uniformly across 240 rows, 28 invoice-family rows carry limits.invoice_line_items = planned, the five #779/#846 wall bodies are at their measured pre-image shas, and the high-water mark agrees with the registry.';
end
$w782_pre$;

-- =====================================================================================
-- §B  THE REPUBLICATION. Two statements, in this order: the content correction under the
--     version it is published at, then the registry-wide raise (0228's precedent) -- so a
--     failure in the correction cannot leave the registry at a version whose content never
--     landed, and the deferred uniformity wall (#846) judges the transaction on what it LEAVES.
-- =====================================================================================
set role clara_fn_owner;

-- B1 · THE CONTENT CORRECTION. Additive idiom (`limits || jsonb`, 0228's own shape): the
--      existing `invoice_line_items` key is OVERWRITTEN by the right-hand operand (jsonb `||`
--      keeps the right side's value on a duplicate key) and a new sibling key is added beside
--      it. Nothing else on these 28 rows moves -- not `basis`, not `typed_facts`, not
--      `business_operation` -- which is the ticket's own "no reading, drafting or posting
--      behaviour changes".
update clara.document_capabilities
   set limits = limits || jsonb_build_object(
         'invoice_line_items', 'accepted_limitation',
         'invoice_line_items_reason', 'no_consumer_reads_line_facts')
 where limits ->> 'invoice_line_items' = 'planned';

-- B2 · THE REGISTRY-WIDE RAISE. One statement, every row, +1 from the uniform 2 the prestate
--      measured -- so `count(distinct registry_version)` stays 1, which is now enforced by BOTH
--      the live test file (`document-capability-registry.test.mjs:223-229`) and the database
--      itself (0244's deferred constraint trigger, #846). 0207's wall sees each row's transition
--      and permits it because it is a raise; 0244's high-water writer raises every pair's mark
--      to 3 in the same statement, as an AFTER trigger.
update clara.document_capabilities
   set registry_version = registry_version + 1;

reset role;

-- =====================================================================================
-- §C  TAIL. Nothing was recut, the 28 rows read what they now claim and nothing else moved on
--     them, the registry publishes exactly one version and it is 3, the high-water mark rose
--     with it, and no application role gained a single privilege on either table.
-- =====================================================================================
do $w782_tail$
declare
  v_sha text; v_n int; v_row record;
begin
  -- 1 · NOTHING WAS RECUT -- the same five wall bodies, at the same five pre-image shas.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_monotone()'::regprocedure;
  if v_sha is distinct from '170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56' then
    raise exception '#782 tail: clara._tf_document_capabilities_version_monotone MOVED during this migration (sha %) -- 0245 recuts nothing', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_high_water()'::regprocedure;
  if v_sha is distinct from 'b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9' then
    raise exception '#782 tail: clara._tf_document_capabilities_version_high_water MOVED during this migration (sha %) -- 0245 recuts nothing', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_high_water_record()'::regprocedure;
  if v_sha is distinct from '839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d' then
    raise exception '#782 tail: clara._tf_document_capabilities_high_water_record MOVED during this migration (sha %) -- 0245 recuts nothing', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capability_high_water_monotone()'::regprocedure;
  if v_sha is distinct from '196780f9528d1d74cbef0bbc400024974ebd9828106c1b0fc8f7026652888f27' then
    raise exception '#782 tail: clara._tf_document_capability_high_water_monotone MOVED during this migration (sha %) -- 0245 recuts nothing', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_uniform()'::regprocedure;
  if v_sha is distinct from 'd21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776' then
    raise exception '#782 tail: clara._tf_document_capabilities_version_uniform MOVED during this migration (sha %) -- 0245 recuts nothing', v_sha
      using errcode = 'CLR10';
  end if;

  -- 2 · THE REGISTRY PUBLISHES EXACTLY ONE VERSION, AND IT IS 3.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#782 tail: the registry publishes % distinct registry_versions -- the whole-registry raise is what keeps this at 1', v_n
      using errcode = 'CLR10';
  end if;
  select min(registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 3 then
    raise exception '#782 tail: the registry publishes version %, not 3', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities;
  if v_n <> 240 then
    raise exception '#782 tail: the registry now holds % rows -- this file inserts and deletes nothing', v_n
      using errcode = 'CLR10';
  end if;

  -- 3 · NO ROW ANYWHERE STILL CARRIES THE PLANNED WORDING.
  select count(*)::int into v_n from clara.document_capabilities
   where limits ->> 'invoice_line_items' = 'planned';
  if v_n <> 0 then
    raise exception '#782 tail: % row(s) still carry limits.invoice_line_items = planned', v_n using errcode = 'CLR10';
  end if;

  -- 4 · THE 28 INVOICE-FAMILY ROWS CARRY THE NEW VALUE AND ITS REASON, AND NOTHING ELSE ON THEM
  --     MOVED -- typed_facts and business_operation stay `supported`, and basis is untouched.
  select count(*)::int into v_n from clara.document_capabilities
   where limits ->> 'invoice_line_items' = 'accepted_limitation'
     and limits ->> 'invoice_line_items_reason' = 'no_consumer_reads_line_facts';
  if v_n <> 28 then
    raise exception '#782 tail: % row(s) carry the new limit and its reason, not the 28 measured in the prestate', v_n
      using errcode = 'CLR10';
  end if;
  for v_row in
    select format, document_kind, typed_facts, business_operation, basis from clara.document_capabilities
     where limits ->> 'invoice_line_items' = 'accepted_limitation'
  loop
    if v_row.typed_facts <> 'supported' or v_row.business_operation <> 'supported' then
      raise exception '#782 tail: % x % moved off typed_facts/business_operation = supported -- this file changes limits only', v_row.format, v_row.document_kind
        using errcode = 'CLR10';
    end if;
    if position('Typed facts are persisted with source regions by' in v_row.basis) = 0 then
      raise exception '#782 tail: % x %''s basis no longer names its facts engine -- 0245 recuts basis text on nobody', v_row.format, v_row.document_kind
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 5 · THE HIGH-WATER MARK ROSE WITH THE REGISTRY, EVERY PAIR, VIA THE ORDINARY WRITER PATH
  --     (#846) -- never a first publication and never a partial raise.
  select count(*)::int into v_n
    from clara.document_capabilities c
    left join clara.document_capability_version_high_water h
      on h.format = c.format and h.document_kind = c.document_kind
   where h.format is null or h.registry_version is distinct from c.registry_version;
  if v_n <> 0 then
    raise exception '#782 tail: % pair(s) carry a high-water mark that disagrees with the published registry after the raise', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capability_version_high_water where registry_version <> 3;
  if v_n <> 0 then
    raise exception '#782 tail: % high-water row(s) sit off version 3', v_n using errcode = 'CLR10';
  end if;

  -- 6 · NO APPLICATION ROLE GAINED ANYTHING -- this file is a data republication, not a grant.
  if pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'INSERT')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'UPDATE')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'DELETE')
     or pg_catalog.has_table_privilege('clara_agent_ro', 'clara.document_capabilities', 'SELECT') then
    raise exception '#782 tail: an application role gained a write grant (or the agent lane gained SELECT) on the registry'
      using errcode = 'CLR10';
  end if;

  raise notice '#782 tail: OK -- the registry re-publishes at version 3 across all 240 rows (one distinct version), the 28 invoice-family rows carry limits.invoice_line_items = accepted_limitation with invoice_line_items_reason = no_consumer_reads_line_facts and no row anywhere still says planned, typed_facts/business_operation/basis are untouched on every one of those 28 rows, the high-water mark rose to 3 in lockstep via #846''s ordinary writer path, and no application role gained anything. Neither 0191, 0207 nor 0244 is edited by this file.';
end
$w782_tail$;
