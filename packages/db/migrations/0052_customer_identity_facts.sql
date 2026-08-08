-- 0052_customer_identity_facts.sql -- known-bug F7: `invoice.contact_person` joins
-- persist_invoice_facts' CLOSED field_path allowlist, so the X7 customer-identity reader can
-- state WHO an invoice is addressed to without that person becoming the counterparty.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, CLAUDE.md + RENUMBER.md). Authored as
-- 0052 against a repo frontier of 0050 while the F6 sibling of the same fix batch is expected to
-- claim 0051; if the merge order moves, renumber mechanically (the file, its rig cells, and
-- nothing else -- nothing keys on the number except the schema_migrations ledger read).
--
-- GOVERNING EVIDENCE: docs/plan/wave-7a-acceptance-h1.md exhibit E7 + rows 1 and 12 of the
-- 22-invoice manifest. ROME SECRETARY issued two real invoices to KONG CHENG RESTAURANTS SDN BHD.
-- Both print the company in the bill-to box and a separate `Attn : Lim Xiao Shan` line under it.
-- Azure Document Intelligence typed `CustomerName` as THE PERSON on both, so `invoice.customer_
-- name` was captured as "Lim Xiao Shan", and both drafts (`53504c0e-...` RM2,800 and
-- `7995b1a3-...` RM600) still sit status='draft' skip=`counterparty_unresolved`. ADR-064 §3
-- registered this as F7, ledger task #32; docs/plan/wave-e-contract.md E-R1 ordains the F6-F9
-- batch as the Wave E build's FIRST STRIKE.
--
-- WHY THE RUNTIME HALF NEEDS THIS DB HALF, stated plainly because the two must ship together.
-- The runtime fix (packages/runtime/lib/invoice-customer-identity.mjs + invoice-party-grammar
-- .mjs, wired into the NOT-FROZEN invoiceFacts.v1.azure.mjs adapter at NORMALIZATION_VERSION
-- v10) reads the boxed party off the layout and emits the Attn person as a SEPARATE new fact,
-- `invoice.contact_person`. This function's field_path allowlist is CLOSED and raises
-- CLR10 'unsupported invoice field_path %' on anything outside it (live body: 0026_lane_widen
-- .sql:744-752). Without this migration the very first extraction carrying the new fact does not
-- merely drop it -- it RAISES, and the whole persist fails, taking the working invoice.total
-- capture with it. So: DB first, or both together; never the runtime alone.
--
-- WHAT THIS FILE DOES NOT DO, and why the omission is deliberate rather than forgotten:
--   * It does NOT touch clara._invoice_fact_state / _invoice_fact_state_at. Those surfaces
--     hand-pick field_paths into named jsonb keys and own CORROBORATION; widening a
--     corroboration-critical body for a non-monetary fact that nothing reads yet would be blast
--     radius bought for nothing. The fact is not invisible: clara.get_document_extract
--     (0011:3232) projects EVERY clara.document_regions row with its field_path and
--     text_content, with no enumeration anywhere in it -- so a persisted contact_person renders
--     on the document-extract surface (agent context pack + the dashboard's doc-review card)
--     the moment it exists. A tail guard below pins that this file left those bodies alone.
--   * It does NOT touch the counterparty master, _resolve_counterparty, or the birth-on-approve
--     block. F7 is an EXTRACTION-side fix. The KONG CHENG redraft is a live act for later, and
--     it must go through the CHAT/hand door, not the autodraft sweep (that is F8's separate
--     defect: admit_autodraft_task answers `already_done` forever once a filing's task
--     completed, whatever a human later does to the draft).
--
-- THE TWO EDITS, both inside clara.persist_invoice_facts and both count-guarded:
--   (1) THE ALLOWLIST (0026:744-751). `invoice.contact_person` is admitted. The taxonomy stays
--       CLOSED -- one name is added to the enumeration, nothing is loosened, and every path
--       outside the list still raises CLR10 exactly as before.
--   (2) THE CONFLICTING-DUPLICATE TEXT SET (0026:810-818). contact_person joins it, so two
--       DIFFERING contact persons for one extraction forfeit that extraction rather than being
--       min()-selected past the guard at read time. This follows the writer's own uniform
--       doctrine ("a field appearing more than once with ANY differing value is a contradiction
--       the DB refuses"), and it is UNREACHABLE from the only producer that exists: the X7
--       reader is uniqueness-or-nothing and emits at most one contact row, and no other producer
--       in the repo emits this path at all (the MyInvois/local_facts mapper does not). An
--       unreachable guard that is correct beats an absent one -- the doctrine is what protects
--       the SECOND producer, whenever it arrives.
--
-- PATCHED, NOT REBUILT -- the 0046 S7.1 / 0048 S1 law. clara.persist_invoice_facts has been
-- recut seven times since 0009 (0011 -> 0013 -> 0015 -> 0016 -> 0022 -> 0023 -> 0026, its
-- current CoR; grep-confirmed that NO migration 0027-0050 replaces it again). A from-file
-- rebuild would silently revert whichever of those the author's copy predates, so the body is
-- harvested from the live catalog with pg_get_functiondef, patched by two count-guarded
-- replace() calls, and re-executed -- never re-typed.
--
-- D1 WRITE-QUIESCE (packages/db/README.md). clara.persist_invoice_facts is the live settlement
-- writer for BOTH the invoice_facts (Azure) and local_facts (MyInvois) lanes. This migration
-- replaces its body, so the repo-mandated D1 obligation binds its live deploy: quiesce new
-- extraction settlement (stop new invoice_facts/local_facts dispatch, let in-flight persists
-- drain), apply, resume. The change is strictly WIDENING -- every payload the old body accepted
-- is accepted identically, and the only new acceptance is a field_path no deployed runtime emits
-- until the v10 adapter ships -- so an interleaved apply cannot corrupt an in-flight persist.
-- The quiesce remains the recorded procedure and this file does not license skipping it.
-- THIS PR DOES NOT DEPLOY OR APPLY ANYTHING LIVE -- the ceremony is a separate, later step,
-- gated on its own review.
--
-- CELLS: packages/db/tests/x52-contact-person-facts.test.mjs -- contact_person persists through
-- persist_invoice_facts and surfaces on document_regions; an unknown field_path still raises
-- CLR10 (the closed taxonomy is not loosened); two DIFFERING contact_person rows forfeit the
-- extraction; two IDENTICAL ones collapse.
set local statement_timeout = '2min';

-- =====================================================================
-- SECTION 0 -- PRESTATE. Every claim above is measured here, before anything changes.
-- Stashed into a temp table (rather than re-measured in the tail) so the tail's SECURITY
-- DEFINER / search_path / ACL comparison is against what THIS run actually saw -- the idiom
-- 0047's and 0048's prestate/tail pairing uses.
-- =====================================================================
create temp table _x52_pre(
  secdef boolean not null,
  config text not null,
  acl    text not null
) on commit drop;

do $prestate$
declare
  v_n int; v_def text; v_count int; v_secdef boolean; v_config text; v_acl text;
  v_allow text; v_dup text;
begin
  -- (0.1) THE BODY OWNER THIS FILE READS must be applied. 0026 is persist_invoice_facts' live
  -- CoR. NO SIBLING IS PINNED BY NAME (0049's precedent): what this file needs is that BODY, not
  -- a particular neighbour, and the runner already refuses an out-of-order number on its own.
  select count(*) into v_n from clara.schema_migrations where version = '0026_lane_widen';
  if v_n <> 1 then
    raise exception '0052 prestate: 0026_lane_widen is not recorded as applied -- apply in order'
      using errcode = 'CLR10';
  end if;

  -- (0.2) EXACTLY ONE persist_invoice_facts overload, at the pinned 6-arity signature.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'persist_invoice_facts';
  if v_n <> 1 then
    raise exception '0052 prestate: expected exactly ONE clara.persist_invoice_facts overload, found %', v_n
      using errcode = 'CLR10';
  end if;
  perform 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure;

  select pg_get_functiondef('clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure)
    into v_def;

  -- (0.3) THE FACT BEING ADMITTED MUST NOT ALREADY BE ADMITTED. A re-run that silently
  -- double-inserted the name into either list would leave a body this file cannot reason about.
  if position('invoice.contact_person' in v_def) <> 0 then
    raise exception '0052 prestate: the live persist_invoice_facts body already mentions invoice.contact_person -- refusing to splice a name that is already there'
      using errcode = 'CLR10';
  end if;

  -- (0.4) THE CLR10 CLOSED-TAXONOMY REFUSAL MUST BE LIVE, READ POSITIVELY -- this file only
  -- makes sense as a widening of a guard that actually refuses today.
  if position('raise exception ''unsupported invoice field_path %''' in v_def) = 0 then
    raise exception '0052 prestate: the closed-taxonomy CLR10 refusal is missing from the live body -- this is not the writer this migration was authored against'
      using errcode = 'CLR10';
  end if;

  -- (0.5) ANCHOR A -- the ALLOWLIST line -- occurs EXACTLY ONCE.
  v_allow := '        ''invoice.customer_name'',''invoice.customer_registration'',''invoice.customer_taxid'',';
  v_count := (length(v_def) - length(replace(v_def, v_allow, ''))) / length(v_allow);
  if v_count <> 1 then
    raise exception '0052 prestate: the allowlist anchor occurs % times in the live body (expected 1) -- this is not the body this migration was authored against', v_count
      using errcode = 'CLR10';
  end if;

  -- (0.6) ANCHOR B -- the conflicting-duplicate TEXT set -- occurs EXACTLY ONCE, and is a
  -- DIFFERENT line from anchor A (they share a token; only the full line disambiguates them).
  v_dup := '        ''invoice.customer_taxid'',''invoice.invoice_id'',''invoice.invoice_date'',';
  v_count := (length(v_def) - length(replace(v_def, v_dup, ''))) / length(v_dup);
  if v_count <> 1 then
    raise exception '0052 prestate: the conflicting-duplicate text-set anchor occurs % times in the live body (expected 1)', v_count
      using errcode = 'CLR10';
  end if;

  -- (0.7) THE 0022/0023 MARKERS THIS PATCH MUST NOT DISTURB -- proves this is the post-0026
  -- body carrying the X3 component taxonomy and the X5-era sign belts; the tail re-reads them.
  if position('''invoice.service_charge'',''invoice.discount'',''invoice.delivery''' in v_def) = 0
     or position('a stated invoice net/tax must not be negative' in v_def) = 0 then
    raise exception '0052 prestate: persist_invoice_facts is missing the 0022/0023 component + sign markers -- not the body this migration accounts for'
      using errcode = 'CLR10';
  end if;

  -- (0.8) STASH SECURITY DEFINER / search_path / ACL for the tail's byte-identical proof.
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>')
    into v_secdef, v_config, v_acl
    from pg_proc where oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure;
  if not v_secdef then
    raise exception '0052 prestate: clara.persist_invoice_facts is not SECURITY DEFINER -- refusing to re-ship a body whose privilege shape this file does not recognise'
      using errcode = 'CLR10';
  end if;
  if v_config = '<none>' or position('search_path=' in v_config) = 0 then
    raise exception '0052 prestate: clara.persist_invoice_facts carries no pinned search_path (proconfig %)', v_config
      using errcode = 'CLR10';
  end if;
  insert into _x52_pre(secdef, config, acl) values (v_secdef, v_config, v_acl);

  raise notice '0052 prestate: clean (0026 applied, one persist_invoice_facts overload, CLR10 refusal live, contact_person absent, both anchors occur exactly once, 0022/0023 markers present)';
end
$prestate$;

-- =====================================================================
-- SECTION 1 -- THE SPLICE. Harvested from the live catalog, patched twice, never re-typed
-- (the 0046 S7.1 / 0048 S1 law: re-typing would silently revert whichever prior CoR this
-- author's copy predates). ONE CREATE OR REPLACE carries both edits.
-- =====================================================================
set role clara_fn_owner;
do $splice$
declare
  v_def text; v_next text; v_allow text; v_dup text; v_repl text; v_count int;
begin
  select pg_get_functiondef('clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure)
    into v_def;

  -- ---- EDIT 1: the CLOSED field_path allowlist admits invoice.contact_person -------------
  v_allow := '        ''invoice.customer_name'',''invoice.customer_registration'',''invoice.customer_taxid'',';
  v_count := (length(v_def) - length(replace(v_def, v_allow, ''))) / length(v_allow);
  if v_count <> 1 then
    raise exception '0052 S1: the allowlist anchor occurs % times in the functiondef about to be edited (expected 1)', v_count
      using errcode = 'CLR10';
  end if;
  -- The reasoning is spliced INTO the body (the 0048 S1 pattern) so the live catalog carries it
  -- for whoever reads pg_get_functiondef next -- not only this file. It deliberately does not
  -- repeat the literal path token, so the tail's "exactly twice" count stays a real guard.
  v_repl := v_allow || chr(10)
    || '        -- [0052 / F7] THE ATTN CONTACT: who the invoice is ADDRESSED TO, which is not' || chr(10)
    || '        -- who the counterparty IS. Read off a labelled `Attn :` line by the X7' || chr(10)
    || '        -- customer-identity reader (packages/runtime/lib/invoice-customer-identity.mjs)' || chr(10)
    || '        -- so the boxed bill-to PARTY can win invoice.customer_name while the named' || chr(10)
    || '        -- person is recorded rather than discarded -- the F7 defect, measured on both' || chr(10)
    || '        -- real KONG CHENG invoices (wave-7a-acceptance-h1.md rows 1 and 12). NON-' || chr(10)
    || '        -- MONETARY, so it can never corroborate a Tier-A total. The taxonomy stays' || chr(10)
    || '        -- CLOSED: one name joins the enumeration, nothing is loosened.' || chr(10)
    || '        ''invoice.contact_person'',';
  v_next := replace(v_def, v_allow, v_repl);

  -- ---- EDIT 2: the conflicting-duplicate TEXT set ---------------------------------------
  v_dup := '        ''invoice.customer_taxid'',''invoice.invoice_id'',''invoice.invoice_date'',';
  v_count := (length(v_next) - length(replace(v_next, v_dup, ''))) / length(v_dup);
  if v_count <> 1 then
    raise exception '0052 S1: the conflicting-duplicate text-set anchor occurs % times after edit 1 (expected 1)', v_count
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_next, v_dup,
    '        ''invoice.customer_taxid'',''invoice.contact_person'',''invoice.invoice_id'',''invoice.invoice_date'',');

  execute v_next;
  raise notice '0052 S1: persist_invoice_facts recut -- invoice.contact_person is admitted, and two DIFFERING contact persons forfeit the extraction';
end
$splice$;
reset role;

-- The grant is UNTOUCHED and deliberately not re-issued: CREATE OR REPLACE preserves a
-- function's existing ACL by Postgres's own rule. Section 2 PROVES that rather than trusting it.

-- =====================================================================
-- SECTION 2 -- TAIL. Proves both edits landed, landed EXACTLY ONCE each, and disturbed nothing
-- else: the name is present in both lists and nowhere else, the old (narrower) anchors are gone,
-- SECURITY DEFINER / search_path / ACL are byte-identical to the prestate stash, the 0022/0023
-- markers and the CLR10 refusal survive, the function still has exactly one overload, and the
-- corroboration read surfaces this file deliberately did not touch are still untouched.
-- =====================================================================
do $tail$
declare
  v_def text; v_n int; v_secdef boolean; v_config text; v_acl text; v_pre record; v_src text;
begin
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'persist_invoice_facts';
  if v_n <> 1 then
    raise exception '0052 tail: expected exactly ONE clara.persist_invoice_facts overload after the splice, found %', v_n;
  end if;

  select pg_get_functiondef('clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure)
    into v_def;

  -- EXACTLY TWO mentions of the new path: one per list. A third would mean a replace matched
  -- more than its intended anchor; a first-only would mean edit 2 silently did nothing.
  v_n := (length(v_def) - length(replace(v_def, 'invoice.contact_person', ''))) / length('invoice.contact_person');
  if v_n <> 2 then
    raise exception '0052 tail: invoice.contact_person appears % times in the post-splice body (expected exactly 2 -- the allowlist and the conflicting-duplicate text set)', v_n;
  end if;
  if position('        ''invoice.contact_person'',' in v_def) = 0 then
    raise exception '0052 tail: the ALLOWLIST admission of invoice.contact_person is missing from the post-splice body';
  end if;
  if position('''invoice.customer_taxid'',''invoice.contact_person'',''invoice.invoice_id''' in v_def) = 0 then
    raise exception '0052 tail: the CONFLICTING-DUPLICATE admission of invoice.contact_person is missing from the post-splice body';
  end if;
  -- The OLD, narrower duplicate-set line must be GONE -- not merely superseded beside itself.
  if position('        ''invoice.customer_taxid'',''invoice.invoice_id'',''invoice.invoice_date'',' in v_def) <> 0 then
    raise exception '0052 tail: the OLD conflicting-duplicate text-set line is still present -- the replace did not land cleanly';
  end if;

  -- The closed taxonomy is still CLOSED, and the belts this file must not disturb survive.
  if position('raise exception ''unsupported invoice field_path %''' in v_def) = 0 then
    raise exception '0052 tail: the closed-taxonomy CLR10 refusal was lost by this splice -- the allowlist would now admit anything';
  end if;
  if position('''invoice.service_charge'',''invoice.discount'',''invoice.delivery''' in v_def) = 0
     or position('a stated invoice net/tax must not be negative' in v_def) = 0
     or position('a local-facts payload must state invoice.type_code' in v_def) = 0 then
    raise exception '0052 tail: a 0022/0023 write-boundary belt was lost by this splice';
  end if;
  -- contact_person is NON-MONETARY and must have joined NO monetary set -- a text fact in the
  -- cents path would normalize to NULL and then be refused as "malformed", turning every
  -- extraction that carries a contact person into a hard CLR10 failure. Proven by reading each
  -- monetary enumeration back VERBATIM rather than by probing for an adjacency that might not be
  -- the one a mistake produced: if the name had landed in any of them, that line would differ
  -- and the check below would fail.
  if position('      and r.field_path in (''invoice.amount_due'',''invoice.deposit'',' in v_def) = 0 then
    raise exception '0052 tail: the malformed-monetary field set is no longer verbatim -- a monetary enumeration was disturbed by this splice';
  end if;
  if position('      and r.field_path in (''invoice.service_charge'',''invoice.discount'',''invoice.delivery'')' in v_def) = 0 then
    raise exception '0052 tail: the non-negative COMPONENT field set is no longer verbatim -- a monetary enumeration was disturbed by this splice';
  end if;
  if position('      and r.field_path in (''invoice.total_excl_tax'',''invoice.tax_total'')' in v_def) = 0 then
    raise exception '0052 tail: the non-negative NET/TAX field set is no longer verbatim -- a monetary enumeration was disturbed by this splice';
  end if;
  if position('v_cents:=case when v_path in (''invoice.total'',''invoice.amount_due'',''invoice.deposit'',' in v_def) = 0 then
    raise exception '0052 tail: the cents-normalization field set is no longer verbatim -- a text fact must never be routed through _normalize_invoice_cents';
  end if;

  -- SECURITY DEFINER, the pinned search_path, and the ACL are byte-identical to prestate.
  select * into v_pre from _x52_pre;
  select prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>'),
      coalesce(pg_catalog.array_to_string(proacl, '|'), '<default>')
    into v_secdef, v_config, v_acl
    from pg_proc where oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure;
  if v_secdef is distinct from v_pre.secdef then
    raise exception '0052 tail: SECURITY DEFINER changed by this splice (was %, now %)', v_pre.secdef, v_secdef;
  end if;
  if v_config is distinct from v_pre.config then
    raise exception '0052 tail: proconfig changed by this splice (was %, now %)', v_pre.config, v_config;
  end if;
  if v_acl is distinct from v_pre.acl then
    raise exception '0052 tail: proacl changed by this splice (was %, now %)', v_pre.acl, v_acl;
  end if;

  -- THE SCOPING DECISION, PINNED AS A CHECKABLE FACT rather than left as prose in the header:
  -- the corroboration read surfaces are deliberately NOT widened by this file. A future
  -- migration that wants contact_person on the fact-state surface must say so deliberately and
  -- will trip this guard, which is exactly the conversation that should happen first.
  select pg_get_functiondef('clara._invoice_fact_state_at(uuid,uuid)'::regprocedure) into v_src;
  if position('contact_person' in v_src) <> 0 then
    raise exception '0052 tail: clara._invoice_fact_state_at mentions contact_person -- this file deliberately does not widen the corroboration read surface';
  end if;
  select pg_get_functiondef('clara._invoice_fact_state(uuid)'::regprocedure) into v_src;
  if position('contact_person' in v_src) <> 0 then
    raise exception '0052 tail: clara._invoice_fact_state mentions contact_person -- this file deliberately does not widen the corroboration read surface';
  end if;

  raise notice '0052 tail: clean -- invoice.contact_person is admitted exactly twice (allowlist + text duplicate set), no monetary set was touched, the CLR10 closed taxonomy and the 0022/0023 belts survive, SECURITY DEFINER + search_path + ACL are byte-identical to prestate, and the corroboration read surfaces are untouched';
end
$tail$;
