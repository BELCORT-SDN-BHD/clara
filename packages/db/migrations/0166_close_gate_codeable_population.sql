-- =====================================================================================
-- DB-A / 2 of 7 -- THE TWO DOCUMENT CLOSE GATES, MADE HONEST ABOUT KIND (H-12).
--
-- APPLY ORDER: AFTER dba1 (clara._is_codeable_kind is born there).
--
-- WHAT IS WRONG TODAY, measured against the LIVE bodies and not their birth text.
-- clara._close_gate_uncoded is live at its 0056:1381 text -- 0104:286 pins its prosrc sha
-- absolutely and 0138:2917-2926 re-proves it byte-identical, and a full 0001->0164 rig
-- replay while authoring this file returned that same sha, so the chase is closed. The body
-- counts EVERY filed document dated inside the fiscal year that carries no live journal
-- entry, with NO predicate on document_kind at all. Ten of the twenty live kinds
-- (documents_document_kind_check, 0123:2054-2061) can never carry an entry.
--
-- THE BANK-STATEMENT CASE IS NOT HYPOTHETICAL AND IT IS PERMANENT.
-- clara.ingest_bank_statement stamps documents.financial_date = period_end UNCONDITIONALLY
-- (0038:1846-1847, its own comment says so), so every statement filed for the year lands
-- inside the FY window and uncoded_documents FAILS. Because the gate is date-scoped, that
-- FAIL never expires: no later close re-asks about a document dated in a year already
-- passed. A professional is told, forever, to code a bank statement -- and the only way
-- past is to attest a finding that was never true, which is how a gate stops being read.
--
-- clara._close_gate_undated (0104:345, the only definition, nothing later re-cuts it)
-- carries the identical population with financial_date IS NULL instead of the BETWEEN, and
-- inherits the identical defect. A bank_statement cannot reach it (ingest always stamps a
-- date) but consent_evidence, ssm_company_doc, identity_document and the rest can.
--
-- WHAT THIS FILE DOES NOT DO. It does not widen either population, it adds no catalog row,
-- and it changes no signature, volatility, security posture or ACL. Both bodies are STABLE
-- SECURITY DEFINER readers, so no D1 write-quiesce window is owed -- neither is an audited
-- writer. The one standing obligation is named in the tail and is why population_basis
-- exists: a close run measured before this deploy and finalized after it reads two different
-- definitions of uncoded_documents.
-- =====================================================================================

-- Precautionary, not load-bearing: two CREATE OR REPLACE bodies, no data movement.
set local statement_timeout = '5min';
set local lock_timeout = '5s';

-- =====================================================================================
-- PRESTATE -- the bodies about to be replaced are the ones this file was authored against.
-- A prosrc sha mismatch STOPS the file; it does not re-cut against a wrong premise.
-- =====================================================================================
do $dba2_pre$
declare
  v_sig text; v_sha text; v_src text; v_got text;
begin
  if to_regprocedure('clara._is_codeable_kind(text)') is null then
    raise exception 'dba2 prestate: clara._is_codeable_kind is absent -- dba1 must apply first'
      using errcode = 'CLR10';
  end if;

  for v_sig, v_sha in
    select * from (values
      -- 0104:286's own absolute pin, re-used verbatim and independently re-measured on a
      -- full 0001->0164 replay (DB-A lane, 2026-09-04). It is the most witnessed constant
      -- available for this body: minted by 0104, re-proven by 0138's tail, replayed here.
      ('clara._close_gate_uncoded(uuid,uuid)', 'e9c5defbfea24942fd7c9936faf5887998ec18fe71519694fb81a7aa97c457df'),
      -- Measured on the same replay. 0104:345 is the only definition of this body.
      ('clara._close_gate_undated(uuid,uuid)', 'c5b7683fb1b4bd42dcfe90a529850e2bee7bc9cd913b8f02fa46380b170fd4c2')
    ) as t(sig, want) loop
    if to_regprocedure(v_sig) is null then
      raise exception 'dba2 prestate: % does not resolve', v_sig using errcode = 'CLR10';
    end if;
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    v_got := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
    if v_got <> v_sha then
      raise exception 'dba2 prestate: % prosrc sha256 mismatch (got %, expected %) -- this is NOT the body this file was authored against. STOP.',
        v_sig, v_got, v_sha using errcode = 'CLR10';
    end if;
    -- IDEMPOTENCY read from the body itself, never from a comment claiming it applied.
    if position('_is_codeable_kind' in v_src) <> 0 then
      raise exception 'dba2 prestate: % already carries the codeability predicate -- already applied to this database', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- The catalog rows these gates hang off are the ones named, in the drawer named.
  if not exists (select 1 from clara.close_gate_checks k
                  where k.check_key = 'uncoded_documents'
                    and k.evaluator_fn = 'clara._close_gate_uncoded' and k.drawer = 2) then
    raise exception 'dba2 prestate: the uncoded_documents catalog row does not name clara._close_gate_uncoded in drawer 2'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.close_gate_checks k
                  where k.check_key = 'undated_documents'
                    and k.evaluator_fn = 'clara._close_gate_undated' and k.drawer = 2) then
    raise exception 'dba2 prestate: the undated_documents catalog row does not name clara._close_gate_undated in drawer 2'
      using errcode = 'CLR10';
  end if;

  raise notice 'dba2 prestate: clean -- both gate bodies match their authored pre-image sha, neither carries the predicate yet, and both drawer-2 catalog rows resolve.';
end $dba2_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- S1 -- clara._close_gate_uncoded : THE CODEABLE POPULATION.
--
-- ONE CONJUNCT ADDED and ONE KEY ADDED; everything else is 0056:1381's text verbatim,
-- comments included, so a reviewer diffs two bodies rather than reading a rewrite.
--
-- WHY population_basis IS NOT COSMETIC. An attestation binds a gate's measured_digest
-- (attest_close_exception). A professional who signed "no FY-dated filings without an entry"
-- against the OLD population signed a DIFFERENT claim from one signed against the new one --
-- and on an empty population the two payloads would otherwise be byte-identical, so the two
-- signatures would be indistinguishable from each other forever. The basis literal makes
-- them provably distinct, which is the whole reason a signed digest is worth signing.
-- =====================================================================================
create or replace function clara._close_gate_uncoded(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_fy record; v_uncoded jsonb;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  -- DATE-SCOPED BY THE BUILD (matrix A27: the live reader list_uncoded_filings has NO date
  -- predicate, so the gate scopes by the document's financial_date -- a NEXT-FY document
  -- must never block THIS year's close). The definer body performs its own client filter;
  -- it inherits nothing from the invoker-posture reader.
  select coalesce(jsonb_agg(jsonb_build_object('filing_id', f.id, 'document_id', f.document_id,
           'financial_date', d.financial_date) order by d.financial_date, f.id), '[]'::jsonb)
    into v_uncoded
    from clara.document_filings f
    join clara.documents d on d.id = f.document_id
    where f.client_id = p_client and f.retired_at is null
      and d.financial_date between v_fy.starts_on and v_fy.ends_on
      -- H-12: A KIND THAT CANNOT CARRY AN ENTRY IS NOT AN UNCODED DOCUMENT. The set is
      -- DATA (clara.document_kind_codeability), never a literal here -- four readers share
      -- one definition and the owner changes it without shipping a migration. NULL and an
      -- unknown kind BOTH read codeable, so an unclassified filing stays visible: the only
      -- thing this conjunct removes is a document somebody positively ruled owes no entry.
      -- The sharpest case is bank_statement, whose financial_date is stamped to period_end
      -- unconditionally at ingest (0038:1846) -- before this, every filed statement failed
      -- this gate permanently for its year.
      and clara._is_codeable_kind(d.document_kind)
      and not exists (select 1 from clara.journal_entries je
             where je.document_id = f.document_id and je.client_id = p_client
               and je.status in ('draft', 'approved')
               -- LIVE coding only (R2.5 MAJOR -- M3's predicate, carried to the sibling
               -- it was always meant for): a reversed original keeps status='approved'
               -- and its mirror is approved too; neither is standing coding. Without
               -- this the gate false-PASSES -- and the date scope makes the miss
               -- permanent, no later close ever asks about this document again.
               and je.reversed_by is null and je.reversal_of is null)
  ;
  return jsonb_build_object(
    'state', case when jsonb_array_length(v_uncoded) = 0 then 'pass' else 'fail' end,
    'uncoded_count', jsonb_array_length(v_uncoded), 'uncoded', v_uncoded,
    'population_basis', 'codeable_kinds_v1');
end $$;

-- =====================================================================================
-- S2 -- clara._close_gate_undated : THE SAME CONJUNCT, THE SAME REASON.
--
-- 0104:345's text verbatim plus the one conjunct and the one key. The two gates measure two
-- halves of ONE population (dated / undated), so a divergence between their predicates would
-- be a hole rather than a difference -- which is why the conjunct is copied, not re-derived.
-- =====================================================================================
create or replace function clara._close_gate_undated(p_client uuid, p_fy uuid) returns jsonb
language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  v_fy record; v_undated jsonb;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  -- FAIL CLOSED ON THE MISSING (design SS3.2 tier B's posture; law 68's ARM-0 shape applied to
  -- a read). Without this branch a non-existent fiscal year yields `ends_on IS NULL`, every
  -- candidate's `filed_on <= NULL` is NULL, the population is empty and the gate answers
  -- `pass` -- absence read as evidence, on the exact gate that exists because a gate which
  -- passes because it cannot see is not a gate.
  if v_fy.id is null then
    return jsonb_build_object('state', 'unknown', 'reason', 'fiscal_year_not_found',
      'undated_count', 0, 'undated', '[]'::jsonb,
      'population_basis', 'codeable_kinds_v1');
  end if;
  -- THE BOUND IS TAKEN IN MYT, not in the session time zone (header note (i)): filed_at is
  -- timestamptz and measured_digest is md5 over this payload, so a session-dependent
  -- rendering would make a signed attestation read STALE from a different connection. The
  -- idiom is the house's (0016:477, 0041:1013) and the clock is clara._book_today()'s.
  select coalesce(jsonb_agg(jsonb_build_object('filing_id', f.id, 'document_id', f.document_id,
           'filed_on', (f.filed_at at time zone 'Asia/Kuala_Lumpur')::date)
           order by (f.filed_at at time zone 'Asia/Kuala_Lumpur')::date, f.id), '[]'::jsonb)
    into v_undated
    from clara.document_filings f
    join clara.documents d on d.id = f.document_id
    where f.client_id = p_client and f.retired_at is null
      and d.financial_date is null
      and (f.filed_at at time zone 'Asia/Kuala_Lumpur')::date <= v_fy.ends_on
      -- H-12, the sibling half -- clara._close_gate_uncoded's own new conjunct, verbatim.
      and clara._is_codeable_kind(d.document_kind)
      and not exists (select 1 from clara.journal_entries je
             where je.document_id = f.document_id and je.client_id = p_client
               and je.status in ('draft', 'approved')
               -- LIVE coding only -- _close_gate_uncoded's own predicate, copied verbatim.
               and je.reversed_by is null and je.reversal_of is null)
  ;
  -- `unknown`, NEVER `fail`: drawer 2 treats unknown exactly like fail for ADMISSION
  -- (finalize_close's drawer-2 arm) while leaving the per-item attested path open (OQ-3).
  -- Saying `fail` would assert a placement nobody read.
  return jsonb_build_object(
    'state', case when jsonb_array_length(v_undated) > 0 then 'unknown' else 'pass' end,
    'undated_count', jsonb_array_length(v_undated), 'undated', v_undated,
    'population_basis', 'codeable_kinds_v1');
end $fn$;

reset role;

-- =====================================================================================
-- TAIL CENSUS -- re-read the live catalog, then BEHAVIOURALLY exercise both directions.
-- A source-text assert proves the words landed, never that the gate answers differently.
-- =====================================================================================
do $dba2_tail$
declare
  v_src text; v_n int; v_sig text;
  v_firm uuid; v_user uuid; v_client uuid; v_fy uuid; v_doc uuid; v_u jsonb;
begin
  -- (1) BOTH BODIES ARE STILL THE SHAPE THEY CLAIM, read from pg_proc and not from this file.
  foreach v_sig in array array['clara._close_gate_uncoded(uuid,uuid)',
                               'clara._close_gate_undated(uuid,uuid)'] loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_sig::regprocedure and p.prosecdef and p.provolatile = 's'
       and p.proowner = 'clara_fn_owner'::regrole
       and array_to_string(p.proconfig, ',') like '%search_path%';
    if v_n <> 1 then
      raise exception 'dba2 tail: % is not a STABLE SECURITY DEFINER search_path-pinned body owned by clara_fn_owner', v_sig
        using errcode = 'CLR10';
    end if;
    -- These are internal evaluators. They were app-callable by nobody and must stay so.
    if pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute')
       or pg_catalog.has_function_privilege('clara_agent_ro', v_sig, 'execute') then
      raise exception 'dba2 tail: % became app-callable', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- (2) THE CONJUNCT LANDED, AND NOTHING ELSE LEFT.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._close_gate_uncoded(uuid,uuid)'::regprocedure;
  if position('clara._is_codeable_kind(d.document_kind)' in v_src) = 0
     or position('d.financial_date between v_fy.starts_on and v_fy.ends_on' in v_src) = 0
     or position('je.reversed_by is null and je.reversal_of is null' in v_src) = 0 then
    raise exception 'dba2 tail: _close_gate_uncoded lost the kind conjunct, the date scope, or the live-coding predicate'
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._close_gate_undated(uuid,uuid)'::regprocedure;
  if position('clara._is_codeable_kind(d.document_kind)' in v_src) = 0
     or position('d.financial_date is null' in v_src) = 0
     or position('fiscal_year_not_found' in v_src) = 0 then
    raise exception 'dba2 tail: _close_gate_undated lost the kind conjunct, the NULL-date scope, or its ARM-0'
      using errcode = 'CLR10';
  end if;

  -- (3) BEHAVIOURAL, on a real firm/client/fiscal-year planted here and rolled back below.
  -- The fixture's column shapes are 0146's own probe idiom (0146:426-436), which is the
  -- house precedent for a behavioural probe inside a migration tail.
  v_user := gen_random_uuid();
  insert into clara.users(id, display_name) values (v_user, 'dba2 tail probe');
  insert into clara.firms(id, name) values (gen_random_uuid(), 'dba2 tail firm ' || gen_random_uuid())
    returning id into v_firm;
  insert into clara.firm_memberships(firm_id, user_id, role, status)
    values (v_firm, v_user, 'viewer', 'active');
  insert into clara.clients(firm_id, name, status)
    values (v_firm, 'dba2 tail client', 'active') returning id into v_client;
  insert into clara.fiscal_years(firm_id, client_id, label, starts_on, ends_on, ordinal,
      status, fy_end_source, opened_by)
    values (v_firm, v_client, 'FY2026', date '2026-01-01', date '2026-12-31',
      1, 'open', 'default_1231', v_user) returning id into v_fy;

  -- (3a) H-12's headline: a filed BANK STATEMENT dated inside the year, no entry. Before this
  -- file it made uncoded_documents FAIL for that year, permanently.
  insert into clara.documents(firm_id, sha256, document_kind, financial_date)
    values (v_firm, repeat('a', 64), 'bank_statement', date '2026-06-30')
    returning id into v_doc;
  insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
    values (v_firm, v_doc, v_client, v_user, 'legacy-0007');
  v_u := clara._close_gate_uncoded(v_client, v_fy);
  if v_u ->> 'state' <> 'pass' or (v_u ->> 'uncoded_count')::int <> 0 then
    raise exception 'dba2 tail (3a): a filed FY-dated bank_statement with no entry reads % / % uncoded -- H-12 is not fixed',
      v_u ->> 'state', v_u ->> 'uncoded_count' using errcode = 'CLR10';
  end if;
  if v_u ->> 'population_basis' <> 'codeable_kinds_v1' then
    raise exception 'dba2 tail (3a): the uncoded payload does not carry population_basis' using errcode = 'CLR10';
  end if;

  -- (3b) THE MUST-NOT-GO-GREEN CONTROL. Without it the conjunct could exclude EVERYTHING and
  -- (3a) would still pass -- a gate that always says pass is the defect, not the fix.
  insert into clara.documents(firm_id, sha256, document_kind, financial_date)
    values (v_firm, repeat('b', 64), 'invoice', date '2026-06-30')
    returning id into v_doc;
  insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
    values (v_firm, v_doc, v_client, v_user, 'legacy-0007');
  v_u := clara._close_gate_uncoded(v_client, v_fy);
  if v_u ->> 'state' <> 'fail' or (v_u ->> 'uncoded_count')::int <> 1 then
    raise exception 'dba2 tail (3b) CONTROL: a filed FY-dated INVOICE with no entry reads % / % uncoded -- the exclusion is over-broad and the gate has stopped working',
      v_u ->> 'state', v_u ->> 'uncoded_count' using errcode = 'CLR10';
  end if;

  -- (3c) THE UNDATED SIBLING, both directions in one pair: a consent_evidence filing with no
  -- financial date must vanish, an unclassified one (kind NULL) must remain.
  insert into clara.documents(firm_id, sha256, document_kind)
    values (v_firm, repeat('c', 64), 'consent_evidence')
    returning id into v_doc;
  insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
    values (v_firm, v_doc, v_client, v_user, 'legacy-0007');
  v_u := clara._close_gate_undated(v_client, v_fy);
  if v_u ->> 'state' <> 'pass' or (v_u ->> 'undated_count')::int <> 0 then
    raise exception 'dba2 tail (3c): an undated consent_evidence filing still reads % / % undated',
      v_u ->> 'state', v_u ->> 'undated_count' using errcode = 'CLR10';
  end if;
  insert into clara.documents(firm_id, sha256)
    values (v_firm, repeat('d', 64))
    returning id into v_doc;
  insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
    values (v_firm, v_doc, v_client, v_user, 'legacy-0007');
  v_u := clara._close_gate_undated(v_client, v_fy);
  if v_u ->> 'state' <> 'unknown' or (v_u ->> 'undated_count')::int <> 1 then
    raise exception 'dba2 tail (3c) CONTROL: an UNCLASSIFIED undated filing reads % / % undated -- a NULL kind must stay visible as still-work',
      v_u ->> 'state', v_u ->> 'undated_count' using errcode = 'CLR10';
  end if;

  raise notice 'dba2 tail: OK -- both gate bodies replaced, still STABLE SECURITY DEFINER, search_path-pinned, clara_fn_owner-owned and app-callable by NOBODY; both keep their unmoved date scope and live-coding predicate beside the new clara._is_codeable_kind conjunct, and both now report population_basis=codeable_kinds_v1 so an attestation signed before this deploy is provably a different claim from one signed after. BEHAVIOURALLY EXERCISED in BOTH directions on a planted fixture: a filed FY-dated bank_statement with no entry now reads pass/0 where it read fail before; a filed FY-dated INVOICE with no entry still reads fail/1 (the must-not-go-green control); an undated consent_evidence filing reads pass/0 while an UNCLASSIFIED undated filing still reads unknown/1. The close_gate_checks catalog is untouched -- no row added, none moved, no signature or ACL changed. No table in workflow/graphile_worker/spike touched. D1: two STABLE readers, no audited writer body replaced, so no write-quiesce window is owed.';

  -- The fixture is EVIDENCE, not state. It must not survive into the deployed database.
  raise exception using errcode = 'CLR00', message = 'dba2 tail probe rollback';
exception when sqlstate 'CLR00' then
  raise notice 'dba2 tail: the behavioural fixture was rolled back -- nothing this block planted survives.';
end $dba2_tail$;
