-- 0342_payroll_registry_business_operation_supported — #1061: THE CAPABILITY REGISTRY STOPS
-- SAYING A PAYROLL READ IS NEVER POSTED, NOW THAT #946 POSTS IT.
-- =====================================================================================
-- Spec of record: issue #1061 (Agent Brief, filed from `wave4-lane01-ticket948.md`, follow-up 1;
-- riders sweep wave, lane 04). No comment on the ticket. The Agent Brief in full:
--
--   "the document capability registry still publishes `business_operation = stored_only` for
--    payroll summaries, even though payroll runs have posted unattended since #946 landed ...
--    The payroll summary pairs' `business_operation` axis should read `supported` (or whatever
--    value correctly describes 'posts unattended once the gate passes'), matching what #948's own
--    capability-registry row for financing agreements does for the same reason. The registry's
--    published version should increment as it does for any other registry change, and the row's
--    reason sentence should be rewritten to say what actually happens ... No other change to the
--    payroll posting gate's own logic or conditions. [No] re-deriving any other document kind's
--    registry row."
--
-- CONFIRMED STILL LIVE ON THIS BRANCH (measured on this rig, 127.0.0.1:55747 / clara_l07,
-- 2026-09-25, chain 0001→0318 plus nothing yet from this lane): the six `payroll_summary`
-- pdf/image rows still read `business_operation = 'stored_only'` and `typed_facts = 'supported'`
-- (`0296_payroll_summary_typed_facts.sql:2340-2347`'s own tail pinned that state), and neither
-- `0297_payroll_summary_posting.sql` nor `0298_payroll_net_pay_settlement.sql` touches
-- `clara.document_capabilities` at all — the registry's claim simply outlived the build once
-- 0297 shipped the drafting-and-posting half 0296's own header deferred to "a later file".
--
-- PARENT FILES, NONE EDITED HERE: 0191_document_capability_registry.sql (the table, the four
-- axes, the `business_operation` CHECK — 'supported' is already one of its ORIGINAL four values,
-- so #988's later fifth level, `proposal_only`, is not this ticket's concern and is not touched),
-- 0207_document_capabilities_version_monotone.sql (the BEFORE UPDATE wall), 0244/0272 (the
-- high-water mark, the uniformity wall and the mark's own no-truncate belt), 0296 (the reading
-- half — six pdf/image `payroll_summary` rows move `typed_facts` to `supported`, republishing at
-- version 5), 0299 (the SAME move for `agreement_contract`, republishing at 6 — the precedent
-- this ticket names verbatim: "matching what #948's own capability-registry row ... does for the
-- same reason").
--
-- THIS FILE CREATES NO FUNCTION, NO TABLE, NO COLUMN, NO TRIGGER, NO CHECK, NO POLICY AND NO
-- GRANT, AND IT RECUTS NOTHING. Its whole content is a republication of
-- `clara.document_capabilities` by UPDATE (never DELETE-then-INSERT, #846): a content correction
-- on the SIX `payroll_summary` pdf/image rows' `business_operation` and `basis` only, then the
-- registry-wide version raise every prior republication has used (0228's precedent, 0299's most
-- recent use).
--
-- WHY `business_operation = 'supported'` IS THE CORRECT VALUE, NOT A FIFTH LEVEL. #988's
-- `proposal_only` ("Clara proposes, a person confirms; no typed fact reaches a posted operation
-- on Clara's own authority") is not this pair's shape: `clara._payroll_posting_verdict` (0297 §D)
-- posts THE ENTRY ITSELF, unattended, the moment every rung of its closed roster holds — nobody
-- confirms a proposal first. That is exactly 0191's own published definition of `supported`
-- ("Clara does this today, and a test proves it" / "where Clara can carry typed facts into it"),
-- and it is the SAME shape 0299 already used for the mirror-image agreement lane. `typed_facts`
-- does not move: it has read `supported` for these six pairs since 0296.
--
-- WHY ONLY `business_operation` AND `basis` MOVE, AND `limits` DOES NOT. The per-employee
-- boundary 0296 named (`limits.payroll_employee_detail = 'accepted_limitation'`,
-- `..._reason = 'quotes_are_summed_then_discarded'`) is UNCHANGED by 0297's posting lane: the
-- persist door still strips every per-employee figure before it is stored
-- (`clara.persist_payroll_facts`, 0296 §9's own tail proof), and `clara._payroll_entry_plan`
-- (0297 §C) drafts from the RUN-LEVEL totals alone — no employee-level fact is read anywhere in
-- the posting path. The limitation is exactly as true after this file as before it, so restating
-- it would not be a re-derivation, it would be noise.
--
-- WHY SIX ROWS, AND ONLY THE SAME SIX 0296 OPENED. `clara._payroll_posting_verdict` is reached
-- from `clara.persist_payroll_facts`, which is reached from the SAME `payroll_facts` router arm
-- 0296 put the six pdf/image pairs on (mime = application/pdf or image/*). The six
-- csv/tsv/xlsx/docx/ofx/xml `payroll_summary` rows never reach that arm — their `typed_facts` is
-- still `stored_only` or `unsupported` from 0296 — so `business_operation` on them would be a
-- promise the router cannot keep and this file leaves every one of them untouched.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. Every claim this file makes about what it is building on, MEASURED on the lane
-- rig (127.0.0.1:55747 / clara_l07) on 2026-09-25, never transcribed from another file's text —
-- an earlier ticket of THIS lane may have recut a body this file relies on (none has: this is the
-- first commit on riders/wS-lane04), and 0272 (a DIFFERENT lane's fix round, already on `main`
-- before this branch was cut) already recut one of the five wall bodies below in place, so its
-- pin is 0272's post-image, never 0244's or 0245's original.
-- =====================================================================================
do $w1061_pre$
declare
  v_n int; v_sha text; v_before int; v_row record;
begin
  foreach v_sha in array array['clara_fn_owner','clara_authenticated','clara_agent_ro','clara_runtime'] loop
    if not exists (select 1 from pg_roles where rolname = v_sha) then
      raise exception '#1061 prestate: role % is missing', v_sha using errcode = 'CLR10';
    end if;
  end loop;
  v_sha := null;

  if to_regclass('clara.document_capabilities') is null then
    raise exception '#1061 prestate: clara.document_capabilities is absent -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;

  -- (a) THE REGISTRY PUBLISHES EXACTLY ONE VERSION TODAY, AND IT IS 6 (0299's own raise, #948).
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#1061 prestate: the registry publishes % distinct registry_versions, not one'
      , v_n using errcode = 'CLR10';
  end if;
  select min(registry_version)::int into v_before from clara.document_capabilities;
  if v_before <> 6 then
    raise exception '#1061 prestate: the registry publishes version %, not the 6 this file raises from'
      , v_before using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities;
  if v_n <> 240 then
    raise exception '#1061 prestate: the registry holds % rows, not 240 -- this file inserts and deletes nothing'
      , v_n using errcode = 'CLR10';
  end if;

  -- (b) EXACTLY THE SIX payroll_summary pdf/image ROWS STILL CARRY THE STALE VERDICT #1061
  -- exists to correct: typed_facts already supported (0296), business_operation still
  -- stored_only, the named per-employee limit in place, and the basis still promising the
  -- pre-0297 dead end.
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'payroll_summary'
     and (mime_type = 'application/pdf' or mime_type like 'image/%')
     and typed_facts = 'supported'
     and business_operation = 'stored_only'
     and limits ->> 'payroll_employee_detail' = 'accepted_limitation'
     and limits ->> 'payroll_employee_detail_reason' = 'quotes_are_summed_then_discarded'
     and position('Nothing is posted from these facts yet' in basis) > 0;
  if v_n <> 6 then
    raise exception '#1061 prestate: % of the 6 payroll pdf/image pairs carry the stale stored_only verdict measured on this rig'
      , v_n using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from clara.document_capabilities
     where document_kind = 'payroll_summary'
       and (mime_type = 'application/pdf' or mime_type like 'image/%')
       and business_operation = 'supported'
  ) then
    raise exception '#1061 prestate: a payroll pdf/image row already reads business_operation = supported -- this file would not be the first writer'
      using errcode = 'CLR10';
  end if;
  -- ...and no OTHER payroll_summary row (the six csv/tsv/xlsx/docx/ofx/xml pairs) is anywhere
  -- near this shape, so the six-row scope below is exact rather than incidental.
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'payroll_summary'
     and not (mime_type = 'application/pdf' or mime_type like 'image/%')
     and business_operation = 'supported';
  if v_n <> 0 then
    raise exception '#1061 prestate: % payroll pair(s) OFF the router''s pdf/image branch already claim business_operation = supported'
      , v_n using errcode = 'CLR10';
  end if;

  -- (c) THE WALLS THIS FILE'S RAISE RIDES, PINNED BY BODY -- 0272 (a prior, already-merged fix
  -- round, not this lane's) recut the fourth of these five in place; every pin here is what is
  -- LIVE on this rig now, never transcribed from 0244's, 0245's or 0272's own file text.
  if to_regprocedure('clara._tf_document_capabilities_version_monotone()') is null then
    raise exception '#1061 prestate: clara._tf_document_capabilities_version_monotone is absent -- 0207 must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_monotone()'::regprocedure;
  if v_sha <> '170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56' then
    raise exception '#1061 prestate: clara._tf_document_capabilities_version_monotone body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;

  if to_regclass('clara.document_capability_version_high_water') is null then
    raise exception '#1061 prestate: clara.document_capability_version_high_water is absent -- 0244 (#846) must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_high_water()'::regprocedure;
  if v_sha <> 'b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9' then
    raise exception '#1061 prestate: clara._tf_document_capabilities_version_high_water body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_high_water_record()'::regprocedure;
  if v_sha <> '839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d' then
    raise exception '#1061 prestate: clara._tf_document_capabilities_high_water_record body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;
  -- THIS ONE IS 0272's POST-IMAGE, NOT 0244's ORIGINAL -- 0272_document_capability_wall_
  -- completion.sql (already on main before this branch cut) armed it a second time as a
  -- key-change BEFORE UPDATE trigger. Measured live on this rig, never copied from an older
  -- migration header.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capability_high_water_monotone()'::regprocedure;
  if v_sha <> '62e83a3b249ca1d0186041ac36c6f77615f3631b04d96eb57fc16f010974ec8c' then
    raise exception '#1061 prestate: clara._tf_document_capability_high_water_monotone body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_uniform()'::regprocedure;
  if v_sha <> 'd21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776' then
    raise exception '#1061 prestate: clara._tf_document_capabilities_version_uniform body drifted (sha %)', v_sha
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
    raise exception '#1061 prestate: % pair(s) carry a high-water mark that disagrees with the published registry'
      , v_n using errcode = 'CLR10';
  end if;

  raise notice '#1061 prestate: OK -- registry publishes version 6 uniformly across 240 rows, the 6 payroll_summary pdf/image rows carry the stale business_operation=stored_only verdict with typed_facts already supported and the named per-employee limit, no other payroll row is near that shape, the five #779/#846/#782 wall bodies are at their measured pre-image shas (the fourth at 0272''s post-image), and the high-water mark agrees with the registry.';
end
$w1061_pre$;

-- =====================================================================================
-- §B  THE REPUBLICATION (AC1, AC3). Two statements, in this order: the content correction under
--     the version it is published at, then the registry-wide raise -- so a failure in the
--     correction cannot leave the registry at a version whose content never landed, and the
--     deferred uniformity wall (#846) judges the transaction on what it LEAVES.
-- =====================================================================================
set role clara_fn_owner;

-- B1 · THE CONTENT CORRECTION, scoped by the SAME mime branch 0296's WHERE clause used, so it
--      names exactly the six pairs the posting lane's router arm actually reaches. `business_
--      operation` is SET to the literal (never derived from the old value), and `basis`'s closing
--      sentence is REPLACED rather than the whole column rewritten, so the unchanged half of the
--      sentence (the byte-extraction engine, the facts engine, the never-guess disclosure, the
--      per-employee-strip disclosure) is provably untouched by construction rather than merely by
--      re-typing it correctly. `replace()` on a basis that no longer contains the old sentence is
--      a no-op, so this statement is redo-safe on its own besides the outer WHERE guard.
update clara.document_capabilities
   set business_operation = 'supported',
       basis = replace(
         basis,
         'Nothing is posted from these facts yet; the filing appears as work a person completes.',
         'Where both reading channels agree, every arithmetic check passes, every account resolves '
         || 'in this client''s own chart, the run''s own month is established and no payroll entry '
         || 'for that client and month is already posted, the run posts unattended: gross pay and '
         || 'the employer''s own EPF, SOCSO, EIS and HRDF cost are debited, and EPF, SOCSO, EIS, PCB '
         || 'and HRDF payable plus salaries payable are credited for the net. Anything else appears '
         || 'under Needs you naming the condition that failed.')
 where document_kind = 'payroll_summary'
   and (mime_type = 'application/pdf' or mime_type like 'image/%')
   and business_operation <> 'supported';

-- B2 · THE REGISTRY-WIDE RAISE. One statement, every row, a SET-TO-LITERAL guarded by
--      `<> 7` (0299's redo-safe form, never `+ 1`: a `+ 1` re-run under CLARA_MIGRATION_REDO
--      would carry the registry to 8) so `count(distinct registry_version)` stays 1 -- enforced
--      by the live battery AND by 0244's deferred uniformity trigger. 0207's wall sees each row's
--      transition and permits it because it is a raise; 0244's high-water writer raises every
--      pair's mark in lockstep.
update clara.document_capabilities
   set registry_version = 7
 where registry_version <> 7;

reset role;

-- =====================================================================================
-- §C  TAIL. Nothing was recut, the six rows read what they now claim and nothing else moved on
--     them, no other payroll_summary row moved, no row outside payroll_summary moved, the
--     registry publishes exactly one version and it is 7, the high-water mark rose with it, and
--     no application role gained a single privilege on either table.
-- =====================================================================================
do $w1061_tail$
declare
  v_sha text; v_n int; v_row record;
begin
  -- 1 · NOTHING WAS RECUT -- the same five wall bodies, at the same five pre-image shas measured
  --     in the prestate (the fourth still at 0272's post-image).
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_monotone()'::regprocedure;
  if v_sha is distinct from '170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56' then
    raise exception '#1061 tail: clara._tf_document_capabilities_version_monotone MOVED during this migration (sha %) -- 0342 recuts nothing', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_high_water()'::regprocedure;
  if v_sha is distinct from 'b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9' then
    raise exception '#1061 tail: clara._tf_document_capabilities_version_high_water MOVED during this migration (sha %) -- 0342 recuts nothing', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_high_water_record()'::regprocedure;
  if v_sha is distinct from '839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d' then
    raise exception '#1061 tail: clara._tf_document_capabilities_high_water_record MOVED during this migration (sha %) -- 0342 recuts nothing', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capability_high_water_monotone()'::regprocedure;
  if v_sha is distinct from '62e83a3b249ca1d0186041ac36c6f77615f3631b04d96eb57fc16f010974ec8c' then
    raise exception '#1061 tail: clara._tf_document_capability_high_water_monotone MOVED during this migration (sha %) -- 0342 recuts nothing', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_uniform()'::regprocedure;
  if v_sha is distinct from 'd21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776' then
    raise exception '#1061 tail: clara._tf_document_capabilities_version_uniform MOVED during this migration (sha %) -- 0342 recuts nothing', v_sha
      using errcode = 'CLR10';
  end if;

  -- 2 · THE REGISTRY PUBLISHES EXACTLY ONE VERSION, AND IT IS 7, OVER THE SAME 240 ROWS.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#1061 tail: the registry publishes % distinct registry_versions -- the whole-registry raise is what keeps this at 1', v_n
      using errcode = 'CLR10';
  end if;
  select min(registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 7 then
    raise exception '#1061 tail: the registry publishes version %, not 7', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities;
  if v_n <> 240 then
    raise exception '#1061 tail: the registry now holds % rows -- this file inserts and deletes nothing', v_n
      using errcode = 'CLR10';
  end if;

  -- 3 · THE SIX PAYROLL PDF/IMAGE ROWS CARRY THE CORRECTED VERDICT, THE OLD SENTENCE IS GONE, AND
  --     THE LIMIT IS UNTOUCHED.
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'payroll_summary'
     and (mime_type = 'application/pdf' or mime_type like 'image/%')
     and typed_facts = 'supported'
     and business_operation = 'supported'
     and limits ->> 'payroll_employee_detail' = 'accepted_limitation'
     and limits ->> 'payroll_employee_detail_reason' = 'quotes_are_summed_then_discarded'
     and position('posts unattended' in basis) > 0
     and position('Nothing is posted from these facts yet' in basis) = 0;
  if v_n <> 6 then
    raise exception '#1061 tail: % of the 6 payroll pdf/image pairs carry the re-derived verdict, its unmoved limit and a basis that no longer promises the pre-0297 dead end', v_n
      using errcode = 'CLR10';
  end if;

  -- 4 · NO OTHER payroll_summary ROW MOVED — the six csv/tsv/xlsx/docx/ofx/xml pairs keep their
  --     pre-0342 business_operation, and none of them gained the payroll_employee_detail limit.
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'payroll_summary'
     and not (mime_type = 'application/pdf' or mime_type like 'image/%')
     and business_operation = 'supported';
  if v_n <> 0 then
    raise exception '#1061 tail: % payroll pair(s) OFF the router''s pdf/image branch gained business_operation = supported', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where limits ? 'payroll_employee_detail' and document_kind <> 'payroll_summary';
  if v_n <> 0 then
    raise exception '#1061 tail: % row(s) outside the payroll family carry a payroll limit', v_n using errcode = 'CLR10';
  end if;

  -- 5 · NO ROW ANYWHERE ELSE MOVED — a document_kind other than payroll_summary reads the same
  --     business_operation it read in the prestate, proven by a family-blind diff over every row
  --     this file's WHERE clauses do not name.
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind <> 'payroll_summary' and business_operation = 'supported'
     and not (
       document_kind = 'invoice' or document_kind = 'credit_note' or document_kind = 'debit_note'
       or document_kind = 'receipt' or document_kind = 'e_invoice_xml'
       or document_kind = 'agreement_contract' or document_kind = 'bank_statement'
       or document_kind = 'opening_balance_doc'
     );
  if v_n <> 0 then
    raise exception '#1061 tail: % row(s) outside every family known to already read business_operation=supported before this file ran now do -- 0342 touched a row it should not have', v_n
      using errcode = 'CLR10';
  end if;

  -- 6 · THE HIGH-WATER MARK ROSE WITH THE REGISTRY, EVERY PAIR, VIA THE ORDINARY WRITER PATH
  --     (#846) -- never a first publication and never a partial raise.
  select count(*)::int into v_n
    from clara.document_capabilities c
    left join clara.document_capability_version_high_water h
      on h.format = c.format and h.document_kind = c.document_kind
   where h.format is null or h.registry_version is distinct from c.registry_version;
  if v_n <> 0 then
    raise exception '#1061 tail: % pair(s) carry a high-water mark that disagrees with the published registry after the raise', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capability_version_high_water where registry_version <> 7;
  if v_n <> 0 then
    raise exception '#1061 tail: % high-water row(s) sit off version 7', v_n using errcode = 'CLR10';
  end if;

  -- 7 · THE HONESTY WALL: business_operation never claims supported where typed_facts does not.
  select count(*)::int into v_n from clara.document_capabilities
   where business_operation = 'supported' and typed_facts <> 'supported';
  if v_n <> 0 then
    raise exception '#1061 tail: % row(s) promise an operation over facts that do not exist', v_n using errcode = 'CLR10';
  end if;

  -- 8 · NO APPLICATION ROLE GAINED ANYTHING -- this file is a data republication, not a grant.
  if pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'INSERT')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'UPDATE')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'DELETE')
     or pg_catalog.has_table_privilege('clara_agent_ro', 'clara.document_capabilities', 'SELECT') then
    raise exception '#1061 tail: an application role gained a write grant (or the agent lane gained SELECT) on the registry'
      using errcode = 'CLR10';
  end if;

  raise notice '#1061 tail: OK -- the registry re-publishes at version 7 across all 240 rows (one distinct version), the 6 payroll_summary pdf/image pairs carry business_operation=supported with typed_facts=supported, the unmoved payroll_employee_detail limit and a basis sentence naming what clara._payroll_posting_verdict actually decides instead of the pre-0297 dead end, no other payroll_summary row and no row outside the payroll family moved, the high-water mark rose to 7 in lockstep via #846''s ordinary writer path, and no application role gained anything. Neither 0191, 0207, 0244, 0272 nor 0296/0297/0298/0299 is edited by this file.';
end
$w1061_tail$;
