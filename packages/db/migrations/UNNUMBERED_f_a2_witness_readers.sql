-- UNNUMBERED_f_a2_witness_readers.sql -- Wave-F Track A, F-A2 opener (6):
-- THE WITNESS-FIRST READER ESTATE. Number claimed at MERGE time (standing law,
-- AGENTS.md + .claude/rules/db-migrations.md).
--
-- SIZING REPORT OF RECORD: the F-A2-R1 rig-replayed verify/census/size lane
-- ("Opener 6 -- _coding_lane_core kind-blindness"), 2026-08-20. Every claim below was
-- re-proven on THIS lane's own throwaway replay before a byte was written; nothing here
-- is inherited on trust.
--
-- =====================================================================================
-- WHAT IS WRONG TODAY
-- =====================================================================================
-- The 0097 cutover rotated the invoice-kind router onto the llm_witness lane, so every
-- NEW invoice-shaped document is born as a witness PAIR (a canonical, region-bearing
-- llm_text_facts row plus a region-free llm_vision_facts row) and no longer as a legacy
-- invoice_facts extraction. 0093 had already taught the corroboration RESOLVER to read
-- both regimes. The READERS were not taught: fourteen bodies still select the document's
-- governing extraction with a hardcoded engine_kind='invoice_facts' (or gate on
-- lane='invoice_facts'), so for a witness-born document they read NOTHING.
--
-- Measured on the replay, 20 independent fixtures, off the live catalog:
--   * the coding lane                     -> needs_review ["vendor_unresolved"] 20/20
--   * the generation selector             -> null for every witness-born document
--   * the direction decision              -> CLR30 on a witness-born document
--   * the catch-up sweep gate             -> witness filings structurally invisible
--   * the two human display bodies        -> 0 regions rendered (legacy renders 1)
--
-- AND THE SAFETY ARGUMENT 0049 WROTE DOWN NO LONGER HOLDS. 0049's guard sets
-- v_direction:='purchase', v_tri:='unresolved' and appends NO reason when the selector
-- answers null, justified in its own comment by "facts_pending is in none of the bypass
-- sets below, so the lane still cannot be ready". The cutover falsified that premise: a
-- witness-born document now gets a fully corroborated state from the resolver while the
-- selector still answers null, so facts_pending never fires and the lane is saved only
-- by the accident of vendor_unresolved. This file restores the premise as an IDENTITY
-- rather than a coincidence -- afterwards the selector answers null exactly when the
-- resolver answers the empty state, because both read the same two generations.
--
-- =====================================================================================
-- THE SHAPE -- LIFT THE RULED PICK, DO NOT WIDEN A KIND LIST
-- =====================================================================================
-- A naive "add the witness kinds to the IN-list" fix was BUILT AND MEASURED on the
-- replay, and it is a coin flip: the readers order by (version_n desc, id desc) over the
-- extraction table, and both halves of a witness pair share version_n, so the winner is
-- decided by uuid comparison. The vision half carries no regions by design, so when it
-- wins the read is empty -- 13 of 20 fixtures starved. Worse, on a document carrying BOTH
-- regimes the naive form picked a different generation from the one the corroboration
-- resolver picked in 5 of 12 fixtures, and 2 of those 12 went READY with amounts
-- corroborated from one generation and a counterparty name read from the other. That is
-- an unattended post whose party name came from a reading the predicate never checked.
--
-- So this file lifts the ALREADY-RULED cross-regime pick out of the 0093 resolver and
-- makes it THE one selector every reader goes through:
--
--   * the witness arm selects the llm_text_facts row ONLY -- never the vision row. The
--     coin flip is therefore structurally impossible rather than fixed by a tiebreak.
--   * precedence is the resolver's, verbatim: the witness generation wins when its
--     extraction clock is >= the legacy one's, or when the legacy clock is unreadable.
--   * every reader selects through that one function, so the lane's party, the binding
--     lane's F1 name, the writers' receipts and the human display cards all read the
--     SAME generation the corroboration predicate judged. Split generations are closed
--     BY CONSTRUCTION, not by a second rule that could drift.
--
-- The precedence question -- which generation governs when both regimes exist -- needed
-- no new ruling: 0093 settled it, and 0097's M-4/M-6 either-regime rulings confirmed it.
-- What this file owes instead is a PROOF that the lifted selector IS the resolver's arm
-- and not merely a spelling of it (review law 3). Section 0.5 discharges that proof
-- mechanically, against the LIVE resolver, and refuses to apply if it fails.
--
-- =====================================================================================
-- THE ESTATE -- 12 BODIES, AND THE TWO DELIBERATE EXCLUSIONS
-- =====================================================================================
--   S1  the generation selector          _document_facts_extraction
--   S1b the region source               _document_facts_regions  (the ONE new function)
--       (the live-selection direction entry point inherits with a ZERO-byte diff: it is
--        one delegating line, so it is deliberately NOT recut and the tail proves it did
--        not move)
--   S2  the pinned-extraction direction  _document_direction_at
--   S3  the coding lane                  _coding_lane_core         (4 region sub-selects)
--   S4  the catch-up sweep gate          list_autodraft_candidates
--   S5  the binding resolver             _resolve_vendor_binding
--   S7  the draft writer                 _draft_entry_core         (2 sites)
--   S8  the revise writer                revise_entry
--   S9  the entry diff                   get_doc_entry_diff        (2 sites)
--   S10 the review card                  get_draft_review          (2 sites)
--   S11 the re-kind task hygiene         classify_document + set_document_kind
--   S12 the transition wall              _tf_processing_task_update
--
-- S12 IS A DEVIATION FROM THE SIZING REPORT, AND IT IS THE ONE THE BATTERY EARNED. The report
-- put the transition trigger in its "already witness-aware, no action" set, which is true of
-- what the report measured (the trigger already knows the witness lane) and false of what S11
-- needs. The wall admits a queued->failed flip carrying the never-claimed `skipped_kind`
-- receipt on invoice_facts, statement_facts and statement_parse ONLY. S11 widens the re-kind
-- retirement to reach a queued witness task -- and without S12 that UPDATE does not silently
-- miss, it RAISES CLR16, turning a live human door into a hard failure for any document that
-- has a queued witness task and is re-kinded away from the invoice family. Measured, not
-- reasoned: the battery cell for S11 failed with "illegal document processing transition queued
-- -> failed" before this section existed.
--
-- The widening is one lane joining one never-claimed code's set, on the wall's OWN stated
-- reasoning: a task's lane is a function of the kind it carried at enqueue, and llm_witness is
-- kind-bound to exactly the four document kinds invoice_facts used to be bound to. Nothing else
-- about the wall moves -- not the two statement gate verdicts, not the two witness consent
-- verdicts, not budget/attempt_cap, not the running/terminal arms, and not the kind-INDEPENDENT
-- classify lane, which still cannot be retired this way. The tail asserts every one of those
-- survives, so this is an EXTENSION of a closed-world set and never a loosening of it.
--
-- EXCLUDED, NAMED, AND MEASURED:
--   * _derive_vendor_binding_proposal -- WITHDRAWN AFTER MEASUREMENT. It was in the plan,
--     it was built, and the rig retired it: 34 existing vendor-binding cells regressed to
--     `binding_unattributable`. Its window lateral reads OTHER, already-approved documents
--     to reconstruct what was read AT APPROVAL TIME, which is a different question from the
--     one the shared selector answers, and the ruled pick's task join narrows it. Section 6
--     carries the full reasoning at the place a reviewer will look for it.
--   * execute_rule_post -- kind-blind and starved, and it stays that way. The Wave-F
--     contract's F-A2 section retires it together with the rule_post consumer, so the
--     rules-machine execution tier not serving witness-born documents is the committed
--     direction rather than an oversight. Spending a recut on a body being retired would
--     buy a review surface for nothing. The tail PROVES it was not touched.
--   * persist_invoice_facts -- kind-blind and CORRECT. It is the legacy regime's own
--     writer; the witness regime has its own. Its literals are its identity, not a blind
--     spot. The tail proves it was not touched either.
--
-- REGISTERED RESIDUAL, MEASURED NOT ASSUMED: routing the binding resolver (S5) through
-- the shared selector does not by itself make the F1/LCP binding lane serve witness-born
-- documents. That body gates on the legacy OCR producer's `vendor_identity` envelope
-- counters, which a witness envelope does not carry, so a witness-born document still
-- leaves it with the `unresolved` outcome -- now for an honest reason (the envelope
-- shape) instead of a starved read. S5 is in this file anyway, and it has to be: the
-- coding lane consults that body for the SAME document it just read a party name from,
-- so leaving it on the legacy pick is precisely the cross-generation mix this file
-- exists to close. Teaching the binding lane the witness envelope is separate work and
-- is NOT claimed here.
--
-- =====================================================================================
-- DEPLOY ORDER AND D1
-- =====================================================================================
-- ORDER (BINDING): this file applies BEFORE the F-A2 openers (1)(2) pair inside the SAME
-- quiesce window. There is ZERO body overlap between the two -- that pair recuts
-- _witness_answers_ok, _enqueue_invoice_facts_core, request_reextraction and
-- _invoice_fact_state_at and mints a new frozen evaluator version; none of those four is
-- in this file's estate, and none of this file's twelve is in theirs -- so the ordering
-- is chosen for MEASUREMENT rather than forced by a collision. This file is inert on the
-- current estate (corroboration is 0/33 on the live corpus today, so a witness-born
-- filing still settles as tier_a_fails and never reaches ready, and the admission door
-- runs the lane check before any budget reservation, so a not-ready outcome reserves
-- nothing and caches nothing) and becomes load-bearing the moment (1)(2) flip
-- corroboration on. Landing it first is the only ordering under which the post-ceremony
-- corpus re-run measures the whole unattended path instead of one conjunct.
--
-- Section 0.5 reads the 0093 resolver's ONE-ARG body, which that pair does not touch, so
-- the proof holds in either order: the ordering above is a measurement contract, not a
-- hidden dependency.
--
-- D1 WRITE-QUIESCE: owed, one window. _draft_entry_core, revise_entry,
-- classify_document and set_document_kind are audited writers, so D1 binds directly, and
-- _tf_processing_task_update is a live trigger on the task table -- an in-flight
-- transaction that entered on the OLD wall would still refuse the retirement S11 mints. The
-- lane and the selectors are STABLE, but 0031, 0046 and 0049 each took the quiesce for
-- exactly this body set because the writer callers span them. PostgreSQL runs an
-- in-flight PL/pgSQL call to completion on the body it STARTED with, so a call spanning
-- this migration silently runs the OLD body. The guard below refuses to apply while a
-- runtime heartbeat is fresh, because a ceremony step that lives only in prose is one
-- somebody skips.
--
-- SPLICE DISCIPLINE (0040 S4.11a / 0090 section 10 / 0097's, verbatim in shape): read the
-- LIVE body off the catalog, assert the target substring occurs EXACTLY the number of
-- times this file claims, replace only there, execute the result. Nothing else in any
-- body is retyped, so every arm this file does not name survives BY CONSTRUCTION. The
-- sizing lane re-proved why that discipline is not optional here: a repo-wide grep for
-- the coding lane's own definition stops three change-of-record splices short of the live
-- body, and roughly forty bodies in this tree are splice-rewritten the same way.
-- Migration text is not the catalog.
set local statement_timeout = '10min';   -- precautionary; nothing here scans a large relation
-- SEARCH PATH PINNED FOR THE WHOLE FILE. Load-bearing, not cosmetic (0093's finding): the
-- tail compares a prestate function census against a post-DDL one, and a clara COMPOSITE
-- argument type renders qualified-or-bare depending on the session path, which makes two
-- untouched functions look like a deletion plus a creation.
set local search_path = clara, pg_temp;

-- =====================================================================================
-- D1 QUIESCE GUARD
-- =====================================================================================
do $o6_quiesce$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A2 opener 6 QUIESCE GUARD: clara.runtime_heartbeats is ABSENT -- the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode='CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A2 opener 6 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) -- this file replaces FOUR audited writer bodies, the task-transition trigger, the coding lane and both direction selectors, and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for staleness (>90s), and re-apply',
      v_component, v_beat;
  end if;
end
$o6_quiesce$;

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every claim this file makes about what it is editing, measured
-- before a byte moves, with the file refusing rather than proceeding on a wrong premise.
-- =====================================================================================
create temp table _o6_pre_fn(oid oid primary key, sha text);
create temp table _o6_pre(k text primary key, v text);
create temp table _o6_acl(sig text primary key, acl text, owner name, vol "char", sec boolean, cfg text);

do $o6_pre$
declare
  v_src text; v_res text; v_n int; v_sig text; v_fold_sel text;
  v_legacy_arm text; v_witness_arm text; v_clock text;
  v_estate text[] := array[
    'clara._document_facts_extraction(uuid)',
    'clara._document_direction_at(uuid,uuid,uuid)',
    'clara._coding_lane_core(uuid,uuid)',
    'clara.list_autodraft_candidates()',
    'clara._resolve_vendor_binding(uuid,uuid,uuid)',
    'clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)',
    'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
    'clara.get_doc_entry_diff(uuid,uuid)',
    'clara.get_draft_review(uuid,uuid)',
    'clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)',
    'clara.set_document_kind(uuid,text,text,text)',
    'clara._tf_processing_task_update()'];
begin
  -- (0.1) FRONTIER. The cutover must be live: this file only makes sense on a database
  -- whose invoice router already mints witness pairs.
  if not exists (select 1 from clara.schema_migrations where version = '0097_f_a1_cutover') then
    raise exception 'F-A2 opener 6 prestate: 0097_f_a1_cutover is not applied -- the readers cannot be taught a regime the router does not yet mint'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._invoice_fact_state(uuid)') is null then
    raise exception 'F-A2 opener 6 prestate: the 0093 cross-regime resolver is absent -- there is no ruled pick to lift'
      using errcode='CLR10';
  end if;
  perform clara.verify_evaluator_freeze();

  -- (0.2) EVERY ESTATE SIGNATURE EXISTS, EXACTLY ONCE EACH BY BARE NAME. A recut that
  -- silently CREATEd a new overload instead of REPLACING the live one would leave the old
  -- body reachable and every arm below would still pass on the new one (0054's lesson).
  -- Counting by bare NAME is the point: that is the shape an accidental second definition
  -- takes.
  foreach v_sig in array v_estate loop
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A2 opener 6 prestate: % does not exist', v_sig using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace='clara'::regnamespace
       and p.proname = split_part(split_part(v_sig,'.',2),'(',1);
    if v_n <> 1 then
      raise exception 'F-A2 opener 6 prestate: % has % definitions by bare name (expected 1) -- an overload this file does not know about would keep the old shape reachable', v_sig, v_n
        using errcode='CLR10';
    end if;
    insert into _o6_acl(sig, acl, owner, vol, sec, cfg)
      select v_sig, coalesce(array_to_string(p.proacl::text[], ' | '), '(null)'),
             r.rolname, p.provolatile, p.prosecdef,
             coalesce(array_to_string(p.proconfig, ' | '), '(null)')
        from pg_proc p join pg_roles r on r.oid = p.proowner
       where p.oid = v_sig::regprocedure;
  end loop;

  -- The census the tail reads is WHOLE-SCHEMA, not this list: "exactly these twelve moved"
  -- is only evidence if every other body was watched too.
  insert into _o6_pre_fn(oid, sha)
    select p.oid, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
      from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.prosrc is not null;

  -- (0.3) THE LINE-ENDING NET. Every splice anchor below is multi-line. On a CRLF
  -- checkout each would match nothing and the exactly-N assertions would fail closed --
  -- correct, but unhelpfully mysterious. Say it directly instead.
  if position(chr(13) in $crlf$select e.id from clara.document_extractions e
        where e.document_id=f.document_id$crlf$) <> 0 then
    raise exception 'F-A2 opener 6 prestate: this FILE was checked out with CRLF line endings -- every multi-line splice anchor would miss. .gitattributes pins *.sql to eol=lf; re-checkout with LF'
      using errcode='CLR10';
  end if;

  -- (0.4) NOT ALREADY APPLIED. The selector is the marker: it is the one body whose
  -- language changes, and no other section of this file can be half-done without it.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._document_facts_extraction(uuid)'::regprocedure;
  if position('llm_text_facts' in v_src) <> 0 then
    raise exception 'F-A2 opener 6 prestate: the generation selector ALREADY reads the witness regime -- already applied'
      using errcode='CLR10';
  end if;

  -- =================================================================================
  -- (0.5) THE LAW-3 PROOF -- the whole review surface of this file, so it is discharged
  -- against the LIVE resolver rather than against anybody's memory of it.
  --
  -- Three claims, each checked by presence of an EXACT text inside the resolver's own
  -- executable source, TOKEN-NORMALIZED so only tokens count:
  --   (a) the arm this file PRESERVES is the resolver's legacy arm -- proven by
  --       normalizing the CURRENT selector body and finding it inside the resolver's;
  --   (b) the witness arm this file INSTALLS is the resolver's witness arm;
  --   (c) the precedence this file INSTALLS is the resolver's precedence.
  -- A selector that merely spells the same predicate but drifts on the timestamp rule
  -- reintroduces the split-generation hazard, and that is the only defect in this area
  -- that can put a wrong counterparty on an unattended post.
  --
  -- THE NORMALIZER IS THREE STEPS AND EACH ONE EARNED ITS PLACE: strip line comments
  -- (prose that quotes a predicate is not the predicate), fold whitespace runs, and then
  -- close the gaps around punctuation. The third step is not cosmetic -- the live selector
  -- writes `e.document_id=t.document_id` and the resolver writes `e.document_id =
  -- t.document_id`, the same tokens with different spacing, and a folder that stopped at
  -- step two reported the two as DRIFTED on the first rig run. Word boundaries are
  -- preserved (only punctuation-adjacent whitespace is removed), so the comparison cannot
  -- collapse two different keyword sequences into one.
  -- =================================================================================
  select p.prosrc into v_res from pg_proc p where p.oid='clara._invoice_fact_state(uuid)'::regprocedure;
  v_res := regexp_replace(regexp_replace(regexp_replace(
             v_res, '--[^' || chr(10) || ']*', '', 'g'), '\s+', ' ', 'g'), '\s*([=,()<>;])\s*', '\1', 'g');

  v_legacy_arm := regexp_replace('from clara.document_processing_tasks t join clara.document_extractions e on e.document_id = t.document_id and e.engine_id = t.engine_id and e.version_n = t.version_n and e.engine_kind = ''invoice_facts'' and e.status = ''done'' where t.document_id = p_document and t.lane in (''invoice_facts'',''local_facts'') and t.status = ''done'' order by t.version_n desc, t.id desc limit 1;',
                    '\s*([=,()<>;])\s*', '\1', 'g');
  v_witness_arm := regexp_replace('select tx.id, tx.extracted_at into v_wit, v_wit_at from clara.document_processing_tasks t join clara.document_extractions tx on tx.document_id = t.document_id and tx.engine_id = t.engine_id and tx.version_n = t.version_n and tx.engine_kind = ''llm_text_facts'' and tx.status = ''done'' where t.document_id = p_document and t.lane = ''llm_witness'' and t.status = ''done'' order by t.version_n desc, t.id desc limit 1;',
                    '\s*([=,()<>;])\s*', '\1', 'g');
  v_clock := regexp_replace('if v_ext_at is null or v_wit_at >= v_ext_at then',
                    '\s*([=,()<>;])\s*', '\1', 'g');

  if position(v_legacy_arm in v_res) = 0 then
    raise exception 'F-A2 opener 6 prestate: the legacy generation arm this file preserves is NOT present in the live cross-regime resolver -- the arm moved, or this file was authored against a different resolver'
      using errcode='CLR10';
  end if;
  if position(v_witness_arm in v_res) = 0 then
    raise exception 'F-A2 opener 6 prestate: the witness generation arm this file lifts is NOT present verbatim in the live cross-regime resolver -- refusing to install a lookalike (review law 3)'
      using errcode='CLR10';
  end if;
  if position(regexp_replace('if v_wit is not null then if v_ext is null then return', '\s*([=,()<>;])\s*', '\1', 'g') in v_res) = 0
     or position(regexp_replace('select e.extracted_at into v_ext_at from clara.document_extractions e where e.id = v_ext;', '\s*([=,()<>;])\s*', '\1', 'g') in v_res) = 0
     or position(v_clock in v_res) = 0 then
    raise exception 'F-A2 opener 6 prestate: the cross-regime PRECEDENCE this file lifts is NOT present verbatim in the live resolver -- the clock rule moved'
      using errcode='CLR10';
  end if;
  -- (a): the selector being replaced IS that legacy arm. Normalized, minus the projection
  -- clause the resolver's own statement carries, the current selector body must be a
  -- substring of the resolver -- so "the legacy arm is preserved unchanged" is a measured
  -- fact rather than a claim, and a pair that had ALREADY drifted refuses here instead of
  -- silently becoming a third pick.
  v_fold_sel := btrim(regexp_replace(regexp_replace(regexp_replace(
                  v_src, '--[^' || chr(10) || ']*', '', 'g'), '\s+', ' ', 'g'), '\s*([=,()<>;])\s*', '\1', 'g'));
  if position(replace(v_fold_sel, 'select e.id ', '') in v_res) = 0 then
    raise exception 'F-A2 opener 6 prestate: the CURRENT generation selector body is not the resolver''s legacy arm -- the two had already drifted. Normalized selector was [%]', v_fold_sel
      using errcode='CLR10';
  end if;
  insert into _o6_pre(k,v) values ('sel_fold', v_fold_sel),
                                  ('legacy_arm', v_legacy_arm),
                                  ('witness_arm', v_witness_arm),
                                  ('clock', v_clock);

  -- (0.55) THE POPULATION THE NARROWING WOULD TOUCH, MEASURED ON THIS DATABASE AND PRINTED.
  -- The ruled pick joins document_processing_tasks; several readers' previous picks did not,
  -- so they also admitted a done legacy extraction that no processing task ever attributed.
  -- Whether that population EXISTS is a fact about the data, not something to reason about
  -- from the writer's shape -- so it is counted here and printed at every apply, including
  -- the ceremony's. Section 5 carries a continuity arm for the one body where the narrowing
  -- would change an outcome that GRANTS A PARTY; this number is what tells a reviewer whether
  -- that arm is load-bearing or vestigial on the estate being deployed to.
  select count(*)::int into v_n
    from clara.document_extractions e
   where e.engine_kind = 'invoice_facts' and e.status = 'done'
     and not exists (
       select 1 from clara.document_processing_tasks t
        where t.document_id = e.document_id and t.engine_id = e.engine_id
          and t.version_n = e.version_n
          and t.lane in ('invoice_facts','local_facts') and t.status = 'done');
  raise notice 'F-A2 opener 6 prestate: % done legacy extraction(s) on this database carry NO task-attributed generation -- the population the ruled pick narrows away, and the reason section 5 keeps a continuity arm', v_n;

  -- (0.6) THE TWO DELIBERATE EXCLUSIONS EXIST AND ARE NAMED, so the tail can prove they
  -- did not move. Naming them here is how "we left them alone" becomes evidence.
  perform 'clara.execute_rule_post(uuid,text)'::regprocedure;
  perform 'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure;

  raise notice 'F-A2 opener 6 prestate: clean -- 0097 live, the 0093 resolver live, all 12 estate signatures unique, and the lifted arms + the cross-regime precedence proven present VERBATIM in the live resolver';
end
$o6_pre$;

-- =====================================================================================
-- SECTION 1 -- THE GENERATION SELECTOR. Witness-first, with the legacy regime as an
-- explicitly-marked fallback.
--
-- This is the ONE place the question "which extraction generation governs this document"
-- is answered, and after this file every reader in the estate asks it here. The two arms
-- and the precedence between them are the 0093 resolver's, lifted -- section 0.5 refuses
-- to apply unless each is present VERBATIM in the live resolver's own source.
--
-- WHY THE WITNESS ARM READS THE TEXT ROW ONLY. A witness pair is two rows sharing
-- (engine_id, version_n) and differing only in kind; the vision half carries no regions
-- by design. Any selector that could return the vision row is a uuid coin flip that
-- silently empties every region read downstream. Naming the text kind is what makes that
-- impossible structurally rather than by a tiebreak somebody could later "simplify" away.
--
-- WHY THE CLOCK AND NOT version_n. version_n is a PER-LANE counter, so a witness pair
-- starts at 1 and a version_n rule would let a stale legacy read outrank it forever. The
-- cross-regime clock is extracted_at. A TIE PREFERS THE WITNESS PAIR, and an unreadable
-- legacy clock does too: fail toward the regime whose timestamp was actually read rather
-- than letting a null comparison pick the older body.
--
-- CHANGE OF LANGUAGE, DELIBERATE. The pre-lift selector was a one-statement SQL function;
-- the precedence needs control flow, so it becomes plpgsql. CREATE OR REPLACE keeps the
-- oid, the owner, the ACL and the definer/search-path settings, and the tail proves all
-- four are unmoved.
--
-- NULL IS STILL "NO EVIDENCE". The selector answers null when NEITHER regime has a done
-- generation for the document, and every caller must keep treating that as "this document
-- has never been read", never as a direction. After this file that null is exactly when
-- the corroboration resolver answers its empty state -- the two agree by construction
-- rather than by coincidence, which is what restores 0049's guard argument.
-- =====================================================================================
create or replace function clara._document_facts_extraction(p_document uuid) returns uuid
  language plpgsql stable security definer set search_path=clara,pg_temp as $o6_sel$
declare v_ext uuid; v_ext_at timestamptz; v_wit uuid; v_wit_at timestamptz;
begin
  -- THE WITNESS REGIME -- the generation the router has minted for every invoice-shaped
  -- document since the cutover, and therefore the ordinary answer. The llm_witness lane,
  -- the TEXT row, and the within-regime ordering key inherited unchanged.
  select tx.id, tx.extracted_at into v_wit, v_wit_at
  from clara.document_processing_tasks t
  join clara.document_extractions tx
    on tx.document_id = t.document_id and tx.engine_id = t.engine_id
   and tx.version_n = t.version_n and tx.engine_kind = 'llm_text_facts'
   and tx.status = 'done'
  where t.document_id = p_document and t.lane = 'llm_witness' and t.status = 'done'
  order by t.version_n desc, t.id desc limit 1;

  -- THE LEGACY REGIME -- AN EXPLICIT FALLBACK ARM, NOT A PEER.
  --   REACH: documents carrying no witness pair -- pre-cutover ingests, and the
  --   local_facts lane's own structured reads. It also wins under the ruled precedence
  --   below in the one remaining case where a document carries BOTH regimes and the
  --   legacy generation's clock is strictly newer, which the ruling settled and this file
  --   does not re-open.
  --   RETIREMENT TRIGGER: the post-ceremony full-population re-extraction plus the F-A2
  --   retirement PR, or the Wave-G factory reset, whichever lands first. At that point
  --   this arm and its callers' legacy vocabulary go together; it is scaffolding for a
  --   population that is being migrated off, not a permanent second regime.
  select e.id into v_ext
  from clara.document_processing_tasks t
  join clara.document_extractions e
    on e.document_id = t.document_id and e.engine_id = t.engine_id
   and e.version_n = t.version_n and e.engine_kind = 'invoice_facts'
   and e.status = 'done'
  where t.document_id = p_document and t.lane in ('invoice_facts','local_facts') and t.status = 'done'
  order by t.version_n desc, t.id desc limit 1;

  -- THE RULED CROSS-REGIME PRECEDENCE, lifted from the 0093 resolver.
  if v_wit is not null then
    if v_ext is null then return v_wit; end if;
    select e.extracted_at into v_ext_at from clara.document_extractions e where e.id = v_ext;
    -- A NULL legacy clock cannot outrank a real one: fail toward the regime whose
    -- timestamp we actually read, rather than letting an unreadable comparison pick the
    -- older body.
    if v_ext_at is null or v_wit_at >= v_ext_at then
      return v_wit;
    end if;
  end if;

  return v_ext;   -- null when neither regime has read this document
end
$o6_sel$;

-- =====================================================================================
-- SECTION 1b -- THE REGION SOURCE. One new function, and the only one this file creates.
--
-- WHY A SECOND FUNCTION AND NOT A WIDER SELECTOR. The ruled pick joins
-- document_processing_tasks -- that is how it reads the LANE, and it is the 0093 resolver's
-- arm verbatim, which is what section 1 exists to preserve. Several readers' ORIGINAL picks
-- had no such join: they took the newest done extraction of the legacy kind whether or not a
-- processing task ever attributed it. Those two are different questions and the difference is
-- a real population, so this file answers both rather than pretending one answer serves:
--
--   * clara._document_facts_extraction -- WHICH GENERATION GOVERNS. The direction chain and
--     the coding lane's own guard ask this, and they must keep asking exactly this: widening
--     it would make a document with no task-attributed generation start ANSWERING a direction
--     question instead of falling into 0049's silent branch, and 0049 measured that branch at
--     38 of 130 live filings. A regression there turns needs_review into a hard needs_you.
--   * clara._document_facts_regions -- WHERE THE REGIONS COME FROM. The governing generation
--     when there is one; otherwise the legacy row no task attributed. Strictly wider, and
--     defined IN TERMS OF the ruled pick so the two can never disagree when the ruled pick has
--     an answer.
--
-- IT CANNOT REINTRODUCE THE SPLIT, STRUCTURALLY. The ruled pick answers non-null whenever ANY
-- witness generation exists -- its witness arm needs no legacy task -- so the coalesce's second
-- arm is unreachable on every document carrying a witness pair. It can only ever reproduce the
-- exact pre-change behaviour for documents with no witness generation AND no task-attributed
-- legacy one. The battery proves that behaviourally rather than by reading this comment.
--
-- THE MEASUREMENT THAT PUT IT HERE, stated because it is the honest provenance: routing the
-- region readers through the ruled pick alone regressed the existing suite, and the sharpest
-- cell was a vendor-binding one where the coding lane stopped reaching its binding fall-backs
-- entirely and a HARD needs_you became a soft needs_review. That is a loosening, on a
-- population this lane cannot prove empty on live data (the prestate counts and prints it).
-- =====================================================================================
-- SET ROLE, AND IT IS LOAD-BEARING (0049 does the same, and the rig proved why). A migration
-- runs as the deploying superuser, so a bare CREATE here would leave this function owned by
-- THAT role while every caller is a SECURITY DEFINER body owned by clara_fn_owner -- and with
-- EXECUTE revoked from PUBLIC, every one of those callers would get 42501 the first time it
-- reached this function. Measured, not reasoned: without this line the full suite went from 1
-- failure to 163, all of them `permission denied for function _document_facts_regions`.
set role clara_fn_owner;
create or replace function clara._document_facts_regions(p_document uuid) returns uuid
  language sql stable security definer set search_path=clara,pg_temp as $o6_reg$
  select coalesce(
    clara._document_facts_extraction(p_document),
    (select e.id
       from clara.document_extractions e
      where e.document_id = p_document
        and e.engine_kind = 'invoice_facts'
        and e.status = 'done'
      order by e.version_n desc, e.id desc
      limit 1));
$o6_reg$;
revoke all on function clara._document_facts_regions(uuid) from public;
reset role;

-- =====================================================================================
-- SECTION 2 -- clara._document_direction_at. The autopost executor's PINNED-extraction
-- entry point carries its own kind filter on the pin, so it does not inherit section 1.
-- The pin is honoured for either region-bearing kind; the vision half is deliberately NOT
-- admitted, because a pin we cannot read regions from is a read that did not happen and
-- must fall through to the core's refusal rather than answer a direction from nothing.
-- =====================================================================================
do $o6_s2$
declare v_def text; v_next text; v_anchor text; v_n int;
begin
  v_def := pg_get_functiondef('clara._document_direction_at(uuid,uuid,uuid)'::regprocedure);
  v_anchor := $a$and e.engine_kind='invoice_facts' and e.status='done';$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S2: the pinned-extraction kind filter occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    $a$and e.engine_kind in ('invoice_facts','llm_text_facts') and e.status='done';$a$);
  execute v_next;
  raise notice 'F-A2 opener 6 S2: the pinned-extraction direction entry point honours a witness TEXT pin; the vision half stays inadmissible';
end
$o6_s2$;

-- =====================================================================================
-- SECTION 3 -- clara._coding_lane_core. The repo's most-guarded judgement body. TWO
-- splices and nothing else:
--   (a) the FOUR identical region sub-selects -- customer_name, customer_registration,
--       vendor_name, vendor_registration -- collapse to the section-1 selector. They were
--       byte-identical to each other, which is why one anchor covers all four and why the
--       count is asserted at 4 rather than replaced blind.
--   (b) the 0049 guard commentary gains the note that its safety argument is restored.
-- The guard CALL itself is not edited: it already names the shared selector, and after
-- section 1 that call resolves either regime. Every other arm of this body -- the
-- multi-doc and non-MYR hard stops, the tier-A conjunct, the sales lane, the counterparty
-- resolution, the binding fall-backs, the open-question, consent, parked, rule-backed,
-- high-stakes and near-duplicate limbs, and the ready-set arithmetic -- survives BY
-- CONSTRUCTION because this file never retypes it.
-- =====================================================================================
do $o6_s3$
declare v_def text; v_next text; v_anchor text; v_n int;
begin
  v_def := pg_get_functiondef('clara._coding_lane_core(uuid,uuid)'::regprocedure);

  v_anchor := $a$(
        select e.id from clara.document_extractions e
        where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc,e.id desc limit 1)$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 4 then
    raise exception 'F-A2 opener 6 S3: the region sub-select occurs % times in the coding lane (expected 4)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor, $a$clara._document_facts_regions(f.document_id)$a$);

  v_anchor := $a$  -- coincidence rather than an identity. Law 3.$a$;
  v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S3: the 0049 guard commentary anchor occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor, $a$  -- coincidence rather than an identity. Law 3.
  --
  -- [F-A2 opener 6] THE GUARD IS NOW REGIME-BLIND, AND 0049'S ARGUMENT ABOVE IS RESTORED
  -- AS AN IDENTITY. The selector this line calls resolves EITHER regime through the ruled
  -- cross-regime pick, so it answers null exactly when the corroboration resolver answers
  -- its empty state -- which is exactly when `facts_pending` was appended a few lines up.
  -- The 0097 cutover had falsified that argument: a witness-born document got a
  -- corroborated state while this selector still answered null, so `facts_pending` never
  -- fired and the lane was saved only by the accident of `vendor_unresolved`. The four
  -- region reads below now select through the SAME selector, so the party this lane
  -- resolves and the amounts the predicate corroborated always come from ONE generation.$a$);

  if position($a$engine_kind='invoice_facts'$a$ in v_next) <> 0 then
    raise exception 'F-A2 opener 6 S3: a legacy kind literal survives in the coding lane after the splice' using errcode='CLR10';
  end if;
  execute v_next;
  raise notice 'F-A2 opener 6 S3: the coding lane reads its four counterparty regions through the shared selector; 0 legacy kind literals remain';
end
$o6_s3$;

-- =====================================================================================
-- SECTION 4 -- clara.list_autodraft_candidates, the CATCH-UP SWEEP's gate. The
-- event-driven path was already regime-agnostic (the rotation emits the same completion
-- event and the per-document candidate lister is kind-free), but this sweep is what
-- catches a filing whose event was missed -- so a witness-born filing was permanently
-- invisible to it. A stranded-run class, and the reason this body is in the mandatory
-- tier rather than the parity tier.
--
-- The gate is a LANE test, not an extraction pick, so it widens rather than delegating:
-- there is no generation to choose here, only "has any facts lane finished for this
-- document". Every other conjunct -- the active-client join, the retired filing, the
-- existing draft/approved entry, the parked attempt, and the sales-admission arm -- is
-- untouched.
-- =====================================================================================
do $o6_s4$
declare v_def text; v_next text; v_anchor text; v_n int;
begin
  v_def := pg_get_functiondef('clara.list_autodraft_candidates()'::regprocedure);
  v_anchor := $a$where t.document_id=f.document_id and t.lane='invoice_facts' and t.status='done')$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S4: the sweep lane gate occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    $a$where t.document_id=f.document_id and t.lane in ('invoice_facts','llm_witness') and t.status='done')$a$);
  execute v_next;
  raise notice 'F-A2 opener 6 S4: the catch-up sweep sees witness-born filings; every other conjunct byte-unmoved';
end
$o6_s4$;

-- =====================================================================================
-- SECTION 5 -- clara._resolve_vendor_binding. Routed through the shared selector so that
-- the binding lane and the coding lane read the SAME generation. See the registered
-- residual in this file's header: for a witness-born document this body still returns the
-- unresolved outcome, because its next gate reads the legacy OCR producer's envelope
-- counters, which a witness envelope does not carry. That is a named limitation of the
-- binding lane, not a starved read -- and routing it here is what stops the coding lane
-- from binding a party out of a generation it did not read the amounts from.
-- =====================================================================================
do $o6_s5$
declare v_def text; v_next text; v_anchor text; v_n int;
begin
  v_def := pg_get_functiondef('clara._resolve_vendor_binding(uuid,uuid,uuid)'::regprocedure);
  v_anchor := $a$  select e.* into v_ext
  from clara.document_extractions e
  where e.document_id=p_document
    and e.engine_kind='invoice_facts'
    and e.status='done'
  order by e.version_n desc,e.id desc
  limit 1;$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S5: the binding resolver''s extraction pick occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  -- THE REGION SOURCE, not the bare ruled pick: this body reads the document's own regions
  -- (the F1 vendor name, the F2 invoice id) and its envelope, so it belongs on the same source
  -- as every other region reader. Section 1b carries the reasoning and the unreachability
  -- proof. FOUND semantics are preserved exactly: a source that answers null selects no row,
  -- so the `if not found` unresolved return below fires as before.
  v_next := replace(v_def, v_anchor, $a$  select e.* into v_ext
  from clara.document_extractions e
  where e.id=clara._document_facts_regions(p_document);$a$);
  execute v_next;
  raise notice 'F-A2 opener 6 S5: the binding resolver reads the governing generation; its unresolved fall-through is unmoved';
end
$o6_s5$;

-- =====================================================================================
-- SECTION 6 -- WITHDRAWN, AND WHY. This section recut
-- clara._derive_vendor_binding_proposal's window lateral onto the shared selector. It was
-- BUILT, APPLIED and MEASURED, and the measurement retired it: 34 existing vendor-binding
-- cells regressed to `binding_unattributable` (CLR36).
--
-- THE CAUSE IS A REAL SEMANTIC DIFFERENCE, not a fixture accident to be papered over. The
-- ruled generation pick joins document_processing_tasks -- that is how it reads the LANE,
-- and it is the resolver's arm verbatim, which is the whole point of section 1. The
-- proposal's lateral had no such join: it took the newest done extraction of the legacy
-- kind whether or not a processing task ever attributed it. Those two are NOT the same
-- question, and the difference is exactly the population the binding estate reads.
--
-- AND THE PROPOSAL IS ASKING THE OTHER QUESTION. Its lateral reads the three most recent
-- APPROVED entries' documents to reconstruct what was read AT APPROVAL TIME -- it stamps
-- facts_extraction_id onto the evidence receipt and refuses on `facts_restated` when the
-- extraction clock is later than approved_at. That is historical reconstruction. The
-- shared selector answers "which generation governs this document NOW". Forcing the
-- backward-looking read through the forward-looking rule narrows it, and narrowing it is
-- what the 34 cells measured.
--
-- NOTHING THIS FILE EXISTS TO CLOSE IS LEFT OPEN BY THE WITHDRAWAL. The split-generation
-- hazard is about the document BEING CODED -- the lane's party read agreeing with the
-- amounts the predicate corroborated. The proposal reads OTHER, historical documents and
-- feeds a human who proposes and a second human who signs; it never selects the party for
-- an unattended post. Its witness-born behaviour is also unchanged by the withdrawal: it
-- was starved before this file and it is starved after, which is the SAME registered
-- residual section 5 carries -- the F1/LCP binding lane does not serve witness-born
-- documents yet, and teaching it to is separate work with its own decision to make about
-- reconstruction versus governance.
-- =====================================================================================

-- =====================================================================================
-- SECTION 7 -- clara._draft_entry_core, an AUDITED WRITER. Two sites:
--   (a) the page-vendor read that feeds the binding proposal path;
--   (b) the facts_extraction_id stamped onto a vendor_binding_resolutions receipt.
-- Site (b) is the one that matters most: a binding receipt that cannot name the
-- generation it bound against is a receipt that cannot be audited. Both now name the
-- governing generation, and both keep their original statement shape so the FOUND flag
-- and every downstream branch behave identically.
-- =====================================================================================
do $o6_s7$
declare v_def text; v_next text; v_anchor text; v_n int;
begin
  v_def := pg_get_functiondef('clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure);

  v_anchor := $a$      where dr.extraction_id=(
        select x.id from clara.document_extractions x
        where x.document_id=p_document
          and x.engine_kind='invoice_facts' and x.status='done'
        order by x.version_n desc,x.id desc limit 1
      ) and dr.field_path='invoice.vendor_name';$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S7: the draft writer''s page-vendor read occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor, $a$      where dr.extraction_id=clara._document_facts_regions(p_document)
        and dr.field_path='invoice.vendor_name';$a$);

  v_anchor := $a$    select x.id into v_facts_extraction
    from clara.document_extractions x
    where x.document_id=p_document
      and x.engine_kind='invoice_facts' and x.status='done'
    order by x.version_n desc,x.id desc limit 1;$a$;
  v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S7: the draft writer''s binding-receipt facts pick occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor, $a$    select x.id into v_facts_extraction
    from clara.document_extractions x
    where x.id=clara._document_facts_regions(p_document);$a$);

  if position($a$engine_kind='invoice_facts'$a$ in v_next) <> 0 then
    raise exception 'F-A2 opener 6 S7: a legacy kind literal survives in the draft writer after both splices' using errcode='CLR10';
  end if;
  execute v_next;
  raise notice 'F-A2 opener 6 S7: the draft writer reads its page vendor and stamps its binding receipt from the governing generation; 0 legacy kind literals remain';
end
$o6_s7$;

-- =====================================================================================
-- SECTION 8 -- clara.revise_entry, an AUDITED WRITER. The same binding-receipt stamp on
-- the revise path, which 0093's own caller census counted but did not assert: this body
-- carries its own extraction pick BESIDE its corroboration-resolver call, so it does not
-- inherit the resolver's dispatch.
-- =====================================================================================
do $o6_s8$
declare v_def text; v_next text; v_anchor text; v_n int;
begin
  v_def := pg_get_functiondef('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)'::regprocedure);
  v_anchor := $a$    select x.id into v_facts_extraction
    from clara.document_extractions x
    where x.document_id=e.document_id
      and x.engine_kind='invoice_facts' and x.status='done'
    order by x.version_n desc,x.id desc limit 1;$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S8: the revise writer''s facts pick occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor, $a$    select x.id into v_facts_extraction
    from clara.document_extractions x
    where x.id=clara._document_facts_regions(e.document_id);$a$);
  if position($a$engine_kind='invoice_facts'$a$ in v_next) <> 0 then
    raise exception 'F-A2 opener 6 S8: a legacy kind literal survives in the revise writer after the splice' using errcode='CLR10';
  end if;
  execute v_next;
  raise notice 'F-A2 opener 6 S8: the revise writer stamps its binding receipt from the governing generation';
end
$o6_s8$;

-- =====================================================================================
-- SECTION 9 -- clara.get_doc_entry_diff. A DISPLAY body granted to clara_authenticated
-- and clara_agent_ro: this is what a reviewer actually sees. Its receivable branch and
-- its payable branch each carry a byte-identical `latest` CTE, so one anchor covers both
-- and the count is asserted at 2. A selector that answers null yields one null-valued CTE
-- row where the old sub-select yielded none; both make the region lookup miss and both
-- render the same no_region marker, so the empty-document rendering is unchanged.
-- =====================================================================================
do $o6_s9$
declare v_def text; v_next text; v_anchor text; v_n int;
begin
  v_def := pg_get_functiondef('clara.get_doc_entry_diff(uuid,uuid)'::regprocedure);
  v_anchor := $a$      select x.id from clara.document_extractions x where x.document_id=e.document_id
        and x.engine_kind='invoice_facts' and x.status='done'
      order by x.version_n desc,x.id desc limit 1$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 2 then
    raise exception 'F-A2 opener 6 S9: the entry diff''s latest-extraction CTE occurs % times (expected 2 -- one per direction branch)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    $a$      select clara._document_facts_regions(e.document_id) as id$a$);
  if position($a$engine_kind='invoice_facts'$a$ in v_next) <> 0 then
    raise exception 'F-A2 opener 6 S9: a legacy kind literal survives in the entry diff after the splice' using errcode='CLR10';
  end if;
  execute v_next;
  raise notice 'F-A2 opener 6 S9: both direction branches of the entry diff read the governing generation';
end
$o6_s9$;

-- =====================================================================================
-- SECTION 10 -- clara.get_draft_review, the human review card (same two grants). Two
-- DIFFERENT sites: the card's own document facts, and the near-duplicate lateral that
-- reads each candidate prior entry's document. Both are region reads that rendered blank
-- for exactly the documents F-A1 was built to read.
-- =====================================================================================
do $o6_s10$
declare v_def text; v_next text; v_anchor text; v_n int;
begin
  v_def := pg_get_functiondef('clara.get_draft_review(uuid,uuid)'::regprocedure);

  v_anchor := $a$(select ex.id
      from clara.document_extractions ex where ex.document_id=e.document_id
        and ex.engine_kind='invoice_facts' and ex.status='done'
      order by ex.version_n desc,ex.id desc limit 1)$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S10: the review card''s own facts pick occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor, $a$clara._document_facts_regions(e.document_id)$a$);

  v_anchor := $a$(select ex.id
          from clara.document_extractions ex where ex.document_id=e2.document_id
            and ex.engine_kind='invoice_facts' and ex.status='done'
          order by ex.version_n desc,ex.id desc limit 1)$a$;
  v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S10: the review card''s near-duplicate lateral occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor, $a$clara._document_facts_regions(e2.document_id)$a$);

  if position($a$engine_kind='invoice_facts'$a$ in v_next) <> 0 then
    raise exception 'F-A2 opener 6 S10: a legacy kind literal survives in the review card after both splices' using errcode='CLR10';
  end if;
  execute v_next;
  raise notice 'F-A2 opener 6 S10: the review card renders the governing generation''s regions, on the card and in its near-duplicate lateral';
end
$o6_s10$;

-- =====================================================================================
-- SECTION 11 -- RE-KIND TASK HYGIENE, both doors. classify_document (machine) and
-- set_document_kind (human) retire a QUEUED task whose lane no longer serves the new
-- kind. Both scoped the invoice half to lane='invoice_facts', so a queued llm_witness
-- task SURVIVED a re-kind and kept blocking the document. The kind set is mirrored, never
-- widened: the same four document kinds decide retirement on both lanes, and the
-- statement lanes' arm is untouched in both bodies.
-- =====================================================================================
do $o6_s11$
declare v_def text; v_next text; v_anchor text; v_n int;
begin
  v_def := pg_get_functiondef('clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)'::regprocedure);
  v_anchor := $a$        and ((lane='invoice_facts'
              and p_kind not in ('invoice','credit_note','debit_note','receipt'))$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S11: the machine door''s re-kind retirement scope occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor, $a$        and ((lane in ('invoice_facts','llm_witness')
              and p_kind not in ('invoice','credit_note','debit_note','receipt'))$a$);
  if position($a$lane in ('statement_facts','statement_parse')$a$ in v_next) = 0 then
    raise exception 'F-A2 opener 6 S11: the statement lanes'' retirement arm did not survive the machine-door splice' using errcode='CLR10';
  end if;
  execute v_next;

  v_def := pg_get_functiondef('clara.set_document_kind(uuid,text,text,text)'::regprocedure);
  v_anchor := $a$      and ((lane='invoice_facts'
            and p_kind not in ('invoice','credit_note','debit_note','receipt'))$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S11: the human door''s re-kind retirement scope occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor, $a$      and ((lane in ('invoice_facts','llm_witness')
            and p_kind not in ('invoice','credit_note','debit_note','receipt'))$a$);
  if position($a$lane in ('statement_facts','statement_parse')$a$ in v_next) = 0 then
    raise exception 'F-A2 opener 6 S11: the statement lanes'' retirement arm did not survive the human-door splice' using errcode='CLR10';
  end if;
  execute v_next;
  raise notice 'F-A2 opener 6 S11: a re-kind now retires a queued witness task at BOTH doors; the statement lanes'' arm and the kind set are unmoved';
end
$o6_s11$;

-- =====================================================================================
-- SECTION 12 -- THE TRANSITION WALL. S11 gave the two re-kind doors a witness lane to
-- retire; this gives that retirement a legal transition to make. ONE lane joins ONE
-- never-claimed receipt's set. See this file's header for why the wall's own reasoning
-- puts llm_witness in exactly this set, and for the measurement that made the section
-- necessary rather than tidy.
-- =====================================================================================
do $o6_s12$
declare v_def text; v_next text; v_anchor text; v_n int; v_survivor text;
begin
  v_def := pg_get_functiondef('clara._tf_processing_task_update()'::regprocedure);
  v_anchor := $a$               or (new.error_code='skipped_kind'
                   and new.lane in ('invoice_facts','statement_facts','statement_parse'))$a$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 opener 6 S12: the skipped_kind arm of the transition wall occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor, $a$               or (new.error_code='skipped_kind'
                   and new.lane in ('invoice_facts','statement_facts','statement_parse','llm_witness'))$a$);

  -- EXTEND, NEVER WEAKEN. Every other arm of the wall must survive the splice VERBATIM, and
  -- each is named individually rather than counted: a count would pass while one arm quietly
  -- became another.
  foreach v_survivor in array array[
      $a$if old.status in ('done','failed') then raise exception 'terminal document processing task is immutable'$a$,
      $a$raise exception 'document processing task identity/config is immutable'$a$,
      $a$v_ok:=(old.status='queued' and new.status in ('running','held_egress'))$a$,
      $a$new.error_code in ('budget','attempt_cap')$a$,
      $a$or (new.error_code in ('consent_inactive','statement_multi_client')
                   and new.lane in ('statement_facts','statement_parse'))$a$,
      $a$or (new.error_code in ('witness_consent_inactive','witness_multi_client')
                   and new.lane='llm_witness')$a$,
      $a$or (old.status='held_egress' and new.status='queued')$a$,
      $a$or (old.status='running' and new.status in ('done','failed','queued','held_egress'))$a$] loop
    if position(v_survivor in v_next) = 0 then
      raise exception 'F-A2 opener 6 S12: an arm of the transition wall did not survive the splice -- [%]', left(v_survivor, 60) using errcode='CLR10';
    end if;
  end loop;
  -- The kind-INDEPENDENT classify lane must remain unretirable. COMMENTS ARE STRIPPED FIRST,
  -- and that is the finding rather than the convenience: the wall's own prose says in words
  -- that the classify lane can never be retired this way, so a naive text match reports the
  -- ABSENCE PROOF as the violation. A guard that reads the commentary is reading a projection
  -- of the code, not the code (review law 3). The rig caught this; reading did not.
  if position($a$'classify'$a$ in regexp_replace(v_next, '--[^' || chr(10) || ']*', '', 'g')) <> 0 then
    raise exception 'F-A2 opener 6 S12: the classify lane appeared in the EXECUTABLE text of the transition wall' using errcode='CLR10';
  end if;
  execute v_next;
  raise notice 'F-A2 opener 6 S12: the transition wall admits a skipped_kind retirement on the witness lane; all eight other arms survive verbatim and the classify lane stays unretirable';
end
$o6_s12$;

-- =====================================================================================
-- SECTION 13 -- TAIL CENSUS. The evidence a reviewer reads, re-read off the committed
-- catalog rather than restated from what this file intended.
-- =====================================================================================
do $o6_tail$
declare
  v_changed text; v_new text; v_src text; v_res text; v_n int; v_sig text;
  v_drift text; v_docs int; v_split int; v_err int; v_doc uuid;
  v_estate text[] := array[
    'clara._document_facts_extraction(uuid)',
    'clara._document_direction_at(uuid,uuid,uuid)',
    'clara._coding_lane_core(uuid,uuid)',
    'clara.list_autodraft_candidates()',
    'clara._resolve_vendor_binding(uuid,uuid,uuid)',
    'clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)',
    'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
    'clara.get_doc_entry_diff(uuid,uuid)',
    'clara.get_draft_review(uuid,uuid)',
    'clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)',
    'clara.set_document_kind(uuid,text,text,text)',
    'clara._tf_processing_task_update()'];
begin
  -- (13.1) EXACTLY TWELVE BODIES MOVED, AND THEY ARE THE TWELVE THIS FILE NAMES --
  -- derived from a WHOLE-SCHEMA prosrc snapshot, not from a list somebody maintained.
  -- This is also the proof of the two deliberate exclusions and of the zero-byte
  -- inheritance claimed for the live-selection direction entry point: all three would
  -- appear here if they had moved.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C")
    into v_changed
    from pg_proc p join _o6_pre_fn pre on pre.oid = p.oid
   where pre.sha <> encode(sha256(convert_to(p.prosrc,'UTF8')),'hex');
  if coalesce(v_changed,'') <> '_coding_lane_core(uuid,uuid), _document_direction_at(uuid,uuid,uuid), _document_facts_extraction(uuid), _draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text), _resolve_vendor_binding(uuid,uuid,uuid), _tf_processing_task_update(), classify_document(uuid,text,numeric,text,text,uuid,text,text), get_doc_entry_diff(uuid,uuid), get_draft_review(uuid,uuid), list_autodraft_candidates(), revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb), set_document_kind(uuid,text,text,text)' then
    raise exception 'F-A2 opener 6 tail: the set of CHANGED clara bodies is [%] -- expected exactly this file''s twelve', coalesce(v_changed,'(none)')
      using errcode='CLR10';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C")
    into v_new
    from pg_proc p where p.pronamespace='clara'::regnamespace and p.prosrc is not null
     and not exists (select 1 from _o6_pre_fn pre where pre.oid = p.oid);
  -- EXACTLY ONE function is created, and it is the region source. Anything else -- an
  -- accidental overload from a mistyped signature above all -- is a hard failure.
  if coalesce(v_new,'') <> '_document_facts_regions(uuid)' then
    raise exception 'F-A2 opener 6 tail: the set of CREATED clara functions is [%] -- expected exactly [_document_facts_regions(uuid)]', coalesce(v_new,'(none)') using errcode='CLR10';
  end if;

  -- (13.2) THE SELECTOR IS THE RESOLVER'S PICK, re-proven POST-DDL against the live
  -- resolver. Prestate proved the arms existed to be lifted; this proves they landed.
  select regexp_replace(regexp_replace(regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g'),
           '\s+', ' ', 'g'), '\s*([=,()<>;])\s*', '\1', 'g')
    into v_res from pg_proc p where p.oid='clara._invoice_fact_state(uuid)'::regprocedure;
  select regexp_replace(regexp_replace(regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g'),
           '\s+', ' ', 'g'), '\s*([=,()<>;])\s*', '\1', 'g')
    into v_src from pg_proc p where p.oid='clara._document_facts_extraction(uuid)'::regprocedure;
  for v_sig in select v from _o6_pre where k in ('legacy_arm','witness_arm','clock') loop
    if position(v_sig in v_src) = 0 then
      raise exception 'F-A2 opener 6 tail: a lifted arm or the clock rule is NOT present verbatim in the installed selector' using errcode='CLR10';
    end if;
    if position(v_sig in v_res) = 0 then
      raise exception 'F-A2 opener 6 tail: a lifted arm or the clock rule is no longer present in the resolver -- the two have diverged' using errcode='CLR10';
    end if;
  end loop;
  -- The selector reads the TEXT half only. A vision literal here would be the coin flip
  -- this whole design exists to make impossible.
  if position('llm_vision_facts' in v_src) <> 0 then
    raise exception 'F-A2 opener 6 tail: the installed selector names the VISION kind -- the region-free half must be unreachable from it' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'order by t.version_n desc,t.id desc limit 1;', '')))
         / length('order by t.version_n desc,t.id desc limit 1;');
  if v_n <> 2 then
    raise exception 'F-A2 opener 6 tail: the within-regime ordering key appears % times in the selector (expected 2 -- one per regime)', v_n using errcode='CLR10';
  end if;

  -- (13.3) ZERO RESIDUAL LEGACY KIND LITERALS in the six reader bodies that were supposed
  -- to stop naming one, and each one must REACH the shared selector -- an absence alone would
  -- pass for a body that simply stopped reading anything. COMMENTS STRIPPED FIRST (0093's
  -- lesson: prose that names a literal is not code that filters on it -- and this file's own
  -- added commentary quotes the very names it removed). The selector itself rides the loop and
  -- is exempted from both arms: it KEEPS its legacy literal, which is the fallback, and it
  -- cannot reach itself. Its own two-regime shape is asserted immediately below.
  foreach v_sig in array array[
      'clara._document_facts_extraction(uuid)',
      'clara._coding_lane_core(uuid,uuid)',
      'clara._resolve_vendor_binding(uuid,uuid,uuid)',
      'clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)',
      'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
      'clara.get_doc_entry_diff(uuid,uuid)',
      'clara.get_draft_review(uuid,uuid)'] loop
    select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
      from pg_proc p where p.oid = v_sig::regprocedure;
    -- TWO bodies legitimately keep a legacy literal and are exempted BY NAME, each for its own
    -- stated reason: the selector's is its fallback ARM, and the binding resolver's is its
    -- continuity arm (section 5). Naming them beats a blanket allowance -- any OTHER body that
    -- grew one back is still a hard failure here.
    if v_sig not in ('clara._document_facts_extraction(uuid)','clara._resolve_vendor_binding(uuid,uuid,uuid)')
       and v_src ~ 'engine_kind\s*=\s*''invoice_facts''' then
      raise exception 'F-A2 opener 6 tail: % still filters on the legacy engine kind in its EXECUTABLE text', v_sig using errcode='CLR10';
    end if;
    if v_sig <> 'clara._document_facts_extraction(uuid)'
       and position('clara._document_facts_regions' in v_src) = 0 then
      raise exception 'F-A2 opener 6 tail: % does not reach the shared region source', v_sig using errcode='CLR10';
    end if;
  end loop;
  -- THE REGION SOURCE IS DEFINED IN TERMS OF THE RULED PICK, AND IN THAT ORDER. Its first
  -- coalesce arm must be the ruled pick -- an inversion would make the wider arm the primary
  -- and hand the split hazard straight back, because the wider arm ranges over BOTH regimes'
  -- rows at the same version_n and is decided by uuid comparison.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p where p.oid='clara._document_facts_regions(uuid)'::regprocedure;
  v_n := position('clara._document_facts_extraction(p_document)' in v_src);
  if v_n = 0 or position('engine_kind' in v_src) < v_n then
    raise exception 'F-A2 opener 6 tail: the region source does not put the RULED pick first' using errcode='CLR10';
  end if;
  if position('llm_' in v_src) <> 0 then
    raise exception 'F-A2 opener 6 tail: the region source names a witness kind of its own -- it must inherit the witness regime ONLY through the ruled pick' using errcode='CLR10';
  end if;
  -- THE NEW FUNCTION'S OWNERSHIP IS NOT COSMETIC, and this assertion exists because the rig
  -- caught its absence: a migration runs as the deploying superuser, so a function created
  -- without SET ROLE is owned by that role while every caller is a definer body owned by
  -- clara_fn_owner -- and with EXECUTE revoked from PUBLIC every caller then gets 42501. A
  -- CREATE is the one place in this file where the owner is not inherited, so it is the one
  -- place that has to be read back.
  select r.rolname || '|' || p.prosecdef::text || '|' || p.provolatile::text || '|'
         || coalesce(array_to_string(p.proconfig, ','), '(null)') || '|'
         || coalesce(array_to_string(p.proacl::text[], ','), '(null)')
    into v_drift
    from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'clara._document_facts_regions(uuid)'::regprocedure;
  if v_drift <> 'clara_fn_owner|true|s|search_path=clara, pg_temp|clara_fn_owner=X/clara_fn_owner' then
    raise exception 'F-A2 opener 6 tail: the region source has the wrong owner/definer/volatility/search_path/ACL shape -- got [%], expected [clara_fn_owner|true|s|search_path=clara, pg_temp|clara_fn_owner=X/clara_fn_owner]', v_drift
      using errcode='CLR10';
  end if;
  -- The selector keeps its legacy literal -- that is the fallback arm, not a blind spot --
  -- but must now also name the witness kind.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p where p.oid='clara._document_facts_extraction(uuid)'::regprocedure;
  if v_src !~ 'engine_kind\s*=\s*''invoice_facts''' or position('llm_text_facts' in v_src) = 0 then
    raise exception 'F-A2 opener 6 tail: the selector must carry BOTH regimes -- the fallback arm and the witness arm' using errcode='CLR10';
  end if;

  -- (13.4) THE LANE GATES. Three bodies widened a lane test rather than a kind pick.
  foreach v_sig in array array[
      'clara.list_autodraft_candidates()',
      'clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)',
      'clara.set_document_kind(uuid,text,text,text)'] loop
    select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
      from pg_proc p where p.oid = v_sig::regprocedure;
    if position('llm_witness' in v_src) = 0 then
      raise exception 'F-A2 opener 6 tail: % does not admit the witness lane', v_sig using errcode='CLR10';
    end if;
    if v_src ~ 'lane\s*=\s*''invoice_facts''' then
      raise exception 'F-A2 opener 6 tail: % still carries a single-lane invoice_facts equality in its EXECUTABLE text', v_sig using errcode='CLR10';
    end if;
  end loop;
  -- The pinned-extraction direction entry point admits the text half and NOT the vision
  -- half: a pin whose regions cannot be read is a read that did not happen.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p where p.oid='clara._document_direction_at(uuid,uuid,uuid)'::regprocedure;
  if position('llm_text_facts' in v_src) = 0 or position('llm_vision_facts' in v_src) <> 0 then
    raise exception 'F-A2 opener 6 tail: the pinned-extraction direction filter must admit the TEXT half and refuse the vision half' using errcode='CLR10';
  end if;
  -- The transition wall now admits the retirement S11 can produce, and the two doors and the
  -- wall agree about WHICH lanes a re-kind may retire. A door that could retire a lane the wall
  -- refuses is a hard failure of a live human verb, which is how this section was found.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_processing_task_update()'::regprocedure;
  if position($a$new.error_code='skipped_kind'$a$ in v_src) = 0
     or position($a$and new.lane in ('invoice_facts','statement_facts','statement_parse','llm_witness')$a$ in v_src) = 0 then
    raise exception 'F-A2 opener 6 tail: the transition wall does not admit a skipped_kind retirement on the witness lane -- the re-kind doors would raise CLR16 instead of retiring' using errcode='CLR10';
  end if;

  -- (13.5) THE GRANT SURFACE DID NOT MOVE. A CREATE OR REPLACE preserves ACLs, owner,
  -- definer-ness and the pinned search_path -- preserves, not "should preserve", so it is
  -- read back rather than assumed. Volatility is compared too: the selector's language
  -- changed, and a definer function that silently became VOLATILE would change plan
  -- behaviour for every caller.
  select string_agg(a.sig, ', ' order by a.sig collate "C") into v_drift
    from _o6_acl a join pg_proc p on p.oid = a.sig::regprocedure
    join pg_roles r on r.oid = p.proowner
   where coalesce(array_to_string(p.proacl::text[], ' | '), '(null)') is distinct from a.acl
      or r.rolname is distinct from a.owner
      or p.provolatile is distinct from a.vol
      or p.prosecdef is distinct from a.sec
      or coalesce(array_to_string(p.proconfig, ' | '), '(null)') is distinct from a.cfg;
  if v_drift is not null then
    raise exception 'F-A2 opener 6 tail: the ACL / owner / volatility / definer / search_path shape MOVED on [%]', v_drift using errcode='CLR10';
  end if;

  -- (13.6) THE FROZEN EVALUATOR CLOSURE IS UNTOUCHED. No body in this estate is a closure
  -- member, so no version mint and no closure re-hash is owed -- and that is verified
  -- rather than asserted, both by the closure's own verifier and by intersecting this
  -- file's twelve with the member roster.
  perform clara.verify_evaluator_freeze();
  select string_agg(m.member_signature, ', ' order by m.member_signature collate "C") into v_drift
    from clara.evaluator_version_members m
   where m.member_signature = any (v_estate);
  if v_drift is not null then
    raise exception 'F-A2 opener 6 tail: this file recut a FROZEN evaluator closure member [%]', v_drift using errcode='CLR10';
  end if;

  -- (13.7) THE STRUCTURAL CLAIM, MEASURED ON WHATEVER THIS DATABASE HOLDS. For every
  -- document present, the selector answers null exactly when the corroboration resolver
  -- answers its empty state -- the identity that restores 0049's guard argument. On a fresh
  -- chain the population is zero and this proves nothing, which is why the counts are
  -- printed: an absence is reported as an absence, never as a pass.
  --
  -- PER-DOCUMENT, WITH ITS OWN HANDLER, deliberately. A set-based predicate would abort the
  -- WHOLE ceremony if the resolver raised on ONE pre-existing document -- a row this file did
  -- not create and does not claim to fix. An unreadable document is counted and reported
  -- separately instead: it is not evidence of agreement, so it is never folded into the
  -- agreed count, and it is not this file's failure either, so it does not abort the deploy.
  v_docs := 0; v_split := 0; v_err := 0;
  for v_doc in select d.id from clara.documents d loop
    v_docs := v_docs + 1;
    begin
      if (clara._document_facts_extraction(v_doc) is null)
         is distinct from (clara._invoice_fact_state(v_doc) = '{}'::jsonb) then
        v_split := v_split + 1;
      end if;
    exception when others then
      v_err := v_err + 1;
    end;
  end loop;
  if v_split <> 0 then
    raise exception 'F-A2 opener 6 tail: % document(s) disagree between the selector''s null and the resolver''s empty state -- the identity this file installs does not hold', v_split
      using errcode='CLR10';
  end if;

  raise notice 'F-A2 opener 6 tail: OK -- exactly 12 bodies recut and exactly 1 created (the region source); the live-selection direction entry point, execute_rule_post and persist_invoice_facts all byte-unmoved; the selector carries BOTH lifted arms and the ruled clock rule verbatim (re-proven against the live resolver post-DDL), names the TEXT half only, and keeps the within-regime ordering key once per regime; 6 reader bodies now reach the shared region source with 0 legacy kind literals in their executable text; 3 lane gates admit llm_witness and 0 keep a single-lane equality; the pinned-extraction filter admits the text half and refuses the vision half; the transition wall admits a skipped_kind retirement on the witness lane with all eight other arms verbatim; ACL/owner/volatility/definer/search_path unmoved on all 12; the frozen evaluator closure verified and intersected empty with this estate; selector-null vs resolver-empty agreed on %/% documents present on this database (% unreadable by the resolver and therefore counted as neither). No table in workflow/graphile_worker/spike touched. D1 write-quiesce taken (four audited writers plus the task-transition trigger).',
    v_docs - v_split - v_err, v_docs, v_err;
end
$o6_tail$;

drop table _o6_pre_fn;
drop table _o6_pre;
drop table _o6_acl;
