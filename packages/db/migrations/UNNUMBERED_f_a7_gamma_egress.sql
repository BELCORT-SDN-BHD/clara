-- UNNUMBERED_f_a7_gamma_egress.sql -- Wave-F Track A, F-A7 (filing + interview), PR-gamma:
-- THE EGRESS TRAIN (window D1-gamma). Number claimed at MERGE time (standing law, AGENTS.md +
-- .claude/rules/db-migrations.md). Design of record: docs/plan/active/filing-and-interview-
-- design.md v2 SS3.5 + annexes-1 Annex A/B.5/C (D-7/D-9/D-18/D-20) + annexes-2 SS3 fold
-- (AB-4/AB-5) + SSI.2 D1-gamma table. Gate record: filing-and-interview-gate-record.md.
--
-- SCOPE (annexes-2 SSI.2 D1-gamma) -- SIX bodies, TWO new purpose-CHECK conjuncts, ONE new
-- three-relation family, THREE kind-vocabulary surfaces, ONE new-code CHECK widening:
--   1. the three client-purpose CHECKs + the doc-sha CHECK: admit a FIFTH purpose,
--      'document_processing' (client-scoped; classify and any future whole-document model read
--      that is not the witness pair), with its OWN doc-sha conjunct (document-tied, mirroring
--      statement_extraction/witness_extraction: document_sha256 IS NOT NULL).
--   2. grant/activate/deactivate/revoke_client_egress_purpose: widen the in-body allowlist to
--      admit 'document_processing' (0090's own finding: the table CHECK alone does not make a
--      purpose grantable).
--   3. prepare_egress_dispatch: its own document_processing pre-check arm (v_sha required,
--      mirroring statement_extraction's shape exactly).
--   4. THE FIRM-NARROW FAMILY (D-7): a brand-new three-relation family,
--      firm_egress_purpose_consents / _activations / _dispatch_authorizations, mirroring 0020's
--      shape with firm_id where client_id stood, ONE purpose ('firm_narrow_intake') and a
--      moment column (check moment in ('attribution','onboarding_interview')) -- "one purpose,
--      two moments" (annexes-1 D-7): the owner's word was "signs ONCE", the moment column keeps
--      the audit line honest per-moment. Plus its four verbs + prepare_firm_egress_dispatch,
--      mirroring the client family's shape and its uniform 'unknown' refusals (0020 SS3.3 non-
--      oracle rule).
--   5. _enqueue_invoice_facts_core: THE CLASSIFY CONSENT GATE, AT ENQUEUE (D-18/AB-4) -- not in
--      claim_document_processing_task, which 0090:494-499 + wb-0020-legacy.test.mjs:630-639
--      forbid a typed-consent call edge in. A filed document requires the client's live
--      document_processing consent+activation; an unfiled one requires the firm-narrow
--      'attribution' moment. Either verdict writes a terminal never-claimed failed receipt,
--      following the statement-lane precedent (flip an in-flight queued task, else idempotent
--      re-read, else fresh insert; never a raise -- this function runs inside file_document /
--      finalize_document_intake / confirm_attribution_candidate / approve_wrong_client_
--      correction and a raise would abort an unrelated filing transaction).
--   6. persist_document_extraction: THE FIRM-NARROW OUTPUT WALL (design SS3.5) -- refuses a
--      fact-generation engine_kind (invoice_facts/statement_facts/llm_text_facts/
--      llm_vision_facts) when the document's only live authorization is firm-narrow.
--      **HONEST NOTE, stated at the point it matters (also in SECTION 6 below):** this
--      function's own existing lane guard (t.lane not in ('ocr','structured_parse','none',
--      'classify') raises CLR16) means v_ekind here can ONLY ever be 'ocr' or 'structured_parse'
--      at THIS frontier -- never a fact-generation kind. The wall is therefore INERT under every
--      caller reachable today, wired ahead of its router in the SAME posture 0090 shipped the
--      llm_witness arm of _enqueue_invoice_facts_core in ("wired now... rather than landing a
--      second CoR on this pinned body then"). Cell 36's negative twin (an OCR kind is admitted
--      under firm-narrow-only) IS forceable today; the positive half is not, and is reported as
--      such rather than claimed proven.
--   7. Kind vocabulary (AB-5/D-9): 'identity_document' becomes a settleable kind on the three DB
--      surfaces of the four (documents_document_kind_check, classify_document's in-body list,
--      set_document_kind's in-body list) and is explicitly NOT added to any refusal list --
--      B8's refusal and the firm-narrow output wall are DB facts, not a prompt instruction
--      (constraint 2). The fourth surface, CLASSIFY_KINDS (classify-llm.mjs), is runtime code
--      and is PR-rho's (annexes-2 SSI.1 train rho), not this file's.
--   8. ck_processing_task_error_code_f_a1: widened for the three new gate codes SECTION 6 mints.
--
-- LEFT OUT OF GAMMA DELIBERATELY (annexes-2 SSI.2): claim_document_processing_task -- it may not
-- gain a typed-consent call edge; this file's SECTION 0 prestate and TAIL both re-assert its
-- prosrc is UNCHANGED, and its own standing battery (wb-0020-legacy.test.mjs:630-639) stays
-- green. CLASSIFY_KINDS (runtime) -- PR-rho. The `filing` wake kind, its role and its allowlist
-- -- PR-beta (D1-beta). C6 (DPA / client disclosure / PDPA cross-border basis) gates only the
-- firm-narrow ACTIVATION verb's real-world use, not this file's apply -- the artefacts exist
-- (docs/ops/legal/), so the schema and the verbs may ship; a firm actually calling
-- activate_firm_egress_purpose without a real evidence document is refused by the SAME
-- evidence-document check the client family already enforces (bytes-verified consent_evidence
-- document required), which is itself the C6 gate made mechanical.
--
-- CRITICAL ORDERING (wave-f-sprint-dag.md SS4 note 9): this file collides with F-A3/PR-1c on the
-- egress purpose CHECK family. PR-1c ships FIRST (bank_matching, the FOURTH purpose) and this
-- file re-reads ITS live text, never the original 0090 three-purpose form -- SECTION 0 asserts
-- the four-purpose form is already live and aborts loudly if it is not (the shared-surface
-- prestate-probe rule, wave-f-lane-brief.md).
--
-- PROVENANCE, measured on THIS lane's own rig replay at the frontier (0102 + F-A3/PR-1c's
-- UNNUMBERED_f_a3_egress_purpose_bank_matching.sql staged as 0103 in a scratch dir, never
-- assumed from migration text): every prosrc sha256 pinned in SECTION 0 below was read live off
-- pg_proc on a throwaway rig, matching F-A3/PR-1c's own postcheck literals exactly --
--   grant_client_egress_purpose      live tip 0090:744, PR-1c-recut   (sha ...102c51ca8, below)
--   activate_client_egress_purpose   live tip 0090:806, PR-1c-recut   (sha ...9596a73, below)
--   deactivate_client_egress_purpose live tip 0090:878, PR-1c-recut   (sha ...c32eadcc8, below)
--   revoke_client_egress_purpose     live tip 0090:940, PR-1c-recut   (sha ...09acb3648, below)
--   prepare_egress_dispatch          live tip 0090:1007, PR-1c-recut  (sha ...3248e8dbbe, below)
--   _enqueue_invoice_facts_core      live tip 0090:1125, F-A2 WINDOW B handoff (sha
--                                    867d4a9560f3ddfab7645a2facfc5460d55c611ca80b9fe86fe1c037eac
--                                    f4d0e, below -- matches that migration's own stated handoff)
--   persist_document_extraction      live tip 0026:497               (sha below)
--   classify_document                live tip 0026:1262, spliced 0038:7816-7840 (sha below)
--   set_document_kind                live tip 0026:1439, spliced 0038:7766       (sha below)
--   claim_document_processing_task   live tip 0090:328 -- NOT CoR'd; sha pinned as a NON-
--                                    REGRESSION assertion, both in SECTION 0 and the TAIL
--   the four purpose CHECKs          PR-1c's widened (four-purpose) form -- names unchanged
--                                    since 0090 (ck_*_purpose_f_a1 / ck_egress_dispatch_
--                                    authorizations_doc_sha)
--   documents_document_kind_check    0017:692-698, 19 values
--   ck_document_extractions_engine_kind_f_a1  0090's 7-value closed world (unchanged by this
--                                    file -- the fact-generation family is a SUBSET read, never
--                                    a widened CHECK)
--
-- NAMES PRESERVED throughout (0090/PR-1c precedent): every DROP+ADD CHECK keeps its exact name;
-- every CREATE OR REPLACE keeps its exact signature, ACL and owner -- measured in the tail, not
-- assumed.
--
-- QUIESCE INVENTORY (D1-gamma; all seven queried, claimed and recut in THIS file):
-- clara.grant_client_egress_purpose, clara.activate_client_egress_purpose,
-- clara.deactivate_client_egress_purpose, clara.revoke_client_egress_purpose,
-- clara.prepare_egress_dispatch, clara._enqueue_invoice_facts_core,
-- clara.persist_document_extraction, clara.classify_document, clara.set_document_kind (nine
-- bodies; the CoR table names six because the four purpose-verbs count as one row). No table in
-- workflow/graphile_worker/spike touched. New objects (no quiesce owed, pure additions):
-- clara.firm_egress_purpose_consents / _activations / _dispatch_authorizations and their four
-- verbs + prepare_firm_egress_dispatch.

set local statement_timeout = '20min'; -- precautionary: nine CoR'd bodies + three new tables +
-- their RLS/policy pairs is real DDL volume, not expected to be slow on any real dataset size.

-- =====================================================================================
-- SECTION 0 -- PRESTATE.
-- =====================================================================================
create temp table _fa7gamma_pre_acl(sig text primary key, acl text);
do $pre$
declare v_src text; v_sha text; v_def text; v_n int; v_sig text;
begin
  if not exists (select 1 from clara.schema_migrations where version = '0102_f_a2_statement_activation') then
    raise exception 'f_a7_gamma_egress prestate: 0102_f_a2_statement_activation is not applied -- frontier mismatch' using errcode='CLR10';
  end if;

  -- THE CRITICAL-ORDERING PROBE (DAG SS4 note 9): F-A3/PR-1c's bank_matching purpose MUST
  -- already be live. Aborts loudly, never silently, on the wrong merge order.
  for v_sig, v_def in
    select c.relname, pg_get_constraintdef(con.oid)
      from pg_constraint con
      join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and con.contype='c'
       and ((c.relname='client_egress_purpose_consents' and con.conname='ck_client_egress_purpose_consents_purpose_f_a1')
         or (c.relname='client_egress_purpose_activations' and con.conname='ck_client_egress_purpose_activations_purpose_f_a1')
         or (c.relname='egress_dispatch_authorizations' and con.conname='ck_egress_dispatch_authorizations_purpose_f_a1'))
  loop
    if v_def <> 'CHECK ((purpose = ANY (ARRAY[''wiki_synthesis''::text, ''statement_extraction''::text, ''witness_extraction''::text, ''bank_matching''::text])))' then
      raise exception 'f_a7_gamma_egress prestate: %''s purpose CHECK is not F-A3/PR-1c''s widened FOUR-purpose form (got %) -- F-A3/PR-1c has not merged, or a different lane already widened this surface. F-A7 gamma may not author against an unmerged or unexpected baseline.', v_sig, v_def using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and con.contype='c' and c.relname in
     ('client_egress_purpose_consents','client_egress_purpose_activations','egress_dispatch_authorizations')
     and con.conname in ('ck_client_egress_purpose_consents_purpose_f_a1','ck_client_egress_purpose_activations_purpose_f_a1','ck_egress_dispatch_authorizations_purpose_f_a1');
  if v_n <> 3 then
    raise exception 'f_a7_gamma_egress prestate: expected exactly 3 purpose CHECKs by name (got %)', v_n using errcode='CLR10';
  end if;

  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='egress_dispatch_authorizations' and con.contype='c'
     and con.conname='ck_egress_dispatch_authorizations_doc_sha';
  if v_def is distinct from 'CHECK ((((purpose <> ''wiki_synthesis''::text) OR (document_sha256 IS NULL)) AND ((purpose <> ''statement_extraction''::text) OR (document_sha256 IS NOT NULL)) AND ((purpose <> ''witness_extraction''::text) OR (document_sha256 IS NOT NULL)) AND ((purpose <> ''bank_matching''::text) OR (document_sha256 IS NULL))))' then
    raise exception 'f_a7_gamma_egress prestate: ck_egress_dispatch_authorizations_doc_sha is not F-A3/PR-1c''s widened four-conjunct form (got %)', coalesce(v_def,'<absent>') using errcode='CLR10';
  end if;

  -- The five client-purpose bodies: PR-1c's own postcheck values.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.grant_client_egress_purpose(uuid,text,uuid,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'fd22131913d842b68904a1c6df26ec1d71ae47214e44eab5cabb994102c51ca8' then
    raise exception 'f_a7_gamma_egress prestate: grant_client_egress_purpose prosrc sha256 mismatch (got %, expected PR-1c''s postcheck value)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.activate_client_egress_purpose(uuid,text,uuid,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'e21fe306630fc2a442e5e055df74d3db5d314385c84fd3faef79e2e219596a73' then
    raise exception 'f_a7_gamma_egress prestate: activate_client_egress_purpose prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.deactivate_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'e88309926a06d277b130f6768dbefec79cfc350a978447757afe777c32eadcc8' then
    raise exception 'f_a7_gamma_egress prestate: deactivate_client_egress_purpose prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.revoke_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'f8be3f3fd05f02c8ef1a2b6a8c383fbc0c508625c69d950594541ee09acb3648' then
    raise exception 'f_a7_gamma_egress prestate: revoke_client_egress_purpose prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'ac646034ceba9e9670dd05702c656ad7ad8ee97ecb2ce0260df3463248e8dbbe' then
    raise exception 'f_a7_gamma_egress prestate: prepare_egress_dispatch prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;

  -- The four F-A7-owned bodies: pinned at THIS lane's own rig-replay frontier (F-A2 Window B for
  -- the shared _enqueue_invoice_facts_core; 0026-lineage, 0038-spliced for the other three).
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '867d4a9560f3ddfab7645a2facfc5460d55c611ca80b9fe86fe1c037eacf4d0e' then
    raise exception 'f_a7_gamma_egress prestate: _enqueue_invoice_facts_core prosrc sha256 mismatch (got %, expected the F-A2 WINDOW B handoff value -- this body is shared with F-A3''s bank/statement lane; re-derive before authoring if this fires, per annexes-2 SSI.4 item 4)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'b9355c863e642a7746135c66b4f428211edc1d61a570921d0dc7eafa2ba90c3b' then
    raise exception 'f_a7_gamma_egress prestate: persist_document_extraction prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'ad44d0a23cde43e6d4f3c5a37dc0d721c4833d086ad4410ad68e442b08326534' then
    raise exception 'f_a7_gamma_egress prestate: classify_document prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.set_document_kind(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '3bc4b17ed7c2bb1f536c1bc9f5fd0e70a5017aafb72836f8a81a6a90399c856e' then
    raise exception 'f_a7_gamma_egress prestate: set_document_kind prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;

  -- NON-REGRESSION (AB-4 / cell 65): claim_document_processing_task must carry NO typed-consent
  -- call edge, both before and after this file. Pinned here so any accidental CoR of this body
  -- by a FUTURE migration is caught at ITS prestate too.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '01e517bf575806a01f93441bbc2459856e1f4f12624b312c3ba670ebf111b9a0' then
    raise exception 'f_a7_gamma_egress prestate: claim_document_processing_task prosrc sha256 mismatch (got %) -- this body must stay byte-unmoved by design (0090:494-499 + wb-0020-legacy.test.mjs:630-639)', v_sha using errcode='CLR10';
  end if;
  if v_src ilike '%client_egress_purpose%' or v_src ilike '%prepare_egress_dispatch%' or v_src ilike '%consume_egress_dispatch%' or v_src ilike '%firm_egress_purpose%' or v_src ilike '%prepare_firm_egress_dispatch%' then
    raise exception 'f_a7_gamma_egress prestate: claim_document_processing_task already carries a typed-consent call edge -- the wall this file depends on (0090:494-499) has already been broken by another lane' using errcode='CLR10';
  end if;

  -- The two document-kind vocabulary lists: 19 values, identity_document absent (AB-5).
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='documents' and con.contype='c' and con.conname='documents_document_kind_check';
  if v_def <> 'CHECK (((document_kind IS NULL) OR (document_kind = ANY (ARRAY[''invoice''::text, ''receipt''::text, ''credit_note''::text, ''debit_note''::text, ''bank_statement''::text, ''payment_voucher''::text, ''claim_form''::text, ''payroll_summary''::text, ''tax_correspondence''::text, ''ssm_company_doc''::text, ''agreement_contract''::text, ''e_invoice_xml''::text, ''management_account''::text, ''opening_balance_doc''::text, ''knowledge_artifact''::text, ''handwritten_note''::text, ''consent_evidence''::text, ''prior_gl''::text, ''other''::text]))))' then
    raise exception 'f_a7_gamma_egress prestate: documents_document_kind_check is not the expected 19-value pre-widening form (got %)', v_def using errcode='CLR10';
  end if;
  if position('identity_document' in (select p.prosrc from pg_proc p where p.oid='clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)'::regprocedure)) > 0 then
    raise exception 'f_a7_gamma_egress prestate: classify_document already names identity_document -- unexpected pre-existing state' using errcode='CLR10';
  end if;
  if position('identity_document' in (select p.prosrc from pg_proc p where p.oid='clara.set_document_kind(uuid,text,text,text)'::regprocedure)) > 0 then
    raise exception 'f_a7_gamma_egress prestate: set_document_kind already names identity_document -- unexpected pre-existing state' using errcode='CLR10';
  end if;

  -- Clean-slate: no document_processing row anywhere; no firm_egress_* table exists yet.
  select count(*)::int into v_n from clara.client_egress_purpose_consents where purpose='document_processing';
  if v_n <> 0 then
    raise exception 'f_a7_gamma_egress prestate: % client_egress_purpose_consents row(s) already carry purpose=document_processing', v_n using errcode='CLR10';
  end if;
  if exists(select 1 from information_schema.tables where table_schema='clara' and table_name in ('firm_egress_purpose_consents','firm_egress_purpose_activations','firm_egress_dispatch_authorizations')) then
    raise exception 'f_a7_gamma_egress prestate: a firm_egress_* table already exists -- unexpected pre-existing state' using errcode='CLR10';
  end if;

  -- Pre-recut ACL of the nine bodies this file replaces, captured BEFORE any DDL.
  for v_sig in select unnest(array[
    'clara.grant_client_egress_purpose(uuid,text,uuid,text,text)',
    'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
    'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
    'clara.revoke_client_egress_purpose(uuid,text,text,text)',
    'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)',
    'clara._enqueue_invoice_facts_core(uuid)',
    'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)',
    'clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)',
    'clara.set_document_kind(uuid,text,text,text)'])
  loop
    insert into _fa7gamma_pre_acl(sig, acl)
    select v_sig, coalesce(
      (select string_agg(a.grantee::regrole::text||':'||a.privilege_type, ',' order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
         from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = v_sig::regprocedure), '(none)');
  end loop;

  raise notice 'f_a7_gamma_egress prestate: clean -- frontier 0102+F-A3/PR-1c, all nine prosrc shas pinned (5 shared + 4 F-A7-owned), claim_document_processing_task confirmed byte-unmoved and edge-free, the four purpose CHECKs at PR-1c''s widened form, kind vocabulary pre-widening confirmed on both DB surfaces, 0 document_processing rows anywhere, no firm_egress_* table pre-existing, 9-row pre-recut ACL captured';
end
$pre$;

-- =====================================================================================
-- SECTION 1 -- the three client-purpose CHECKs, DROP+ADD widened to a FIFTH purpose,
-- 'document_processing'. NAMES PRESERVED.
-- =====================================================================================
alter table clara.client_egress_purpose_consents
  drop constraint ck_client_egress_purpose_consents_purpose_f_a1;
alter table clara.client_egress_purpose_consents
  add constraint ck_client_egress_purpose_consents_purpose_f_a1
  check (purpose in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing'));

alter table clara.client_egress_purpose_activations
  drop constraint ck_client_egress_purpose_activations_purpose_f_a1;
alter table clara.client_egress_purpose_activations
  add constraint ck_client_egress_purpose_activations_purpose_f_a1
  check (purpose in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing'));

alter table clara.egress_dispatch_authorizations
  drop constraint ck_egress_dispatch_authorizations_purpose_f_a1;
alter table clara.egress_dispatch_authorizations
  add constraint ck_egress_dispatch_authorizations_purpose_f_a1
  check (purpose in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing'));

-- =====================================================================================
-- SECTION 2 -- ck_egress_dispatch_authorizations_doc_sha, RECUT with its OWN fifth conjunct:
-- document_processing REQUIRES a hash (the statement_extraction/witness_extraction shape --
-- classify reads exactly one document). NAME PRESERVED.
-- =====================================================================================
do $s2_pre$
declare v_bad int;
begin
  select count(*)::int into v_bad from clara.egress_dispatch_authorizations
   where not ((purpose <> 'wiki_synthesis' or document_sha256 is null)
          and (purpose <> 'statement_extraction' or document_sha256 is not null)
          and (purpose <> 'witness_extraction' or document_sha256 is not null)
          and (purpose <> 'bank_matching' or document_sha256 is null)
          and (purpose <> 'document_processing' or document_sha256 is not null));
  if v_bad<>0 then
    raise exception 'f_a7_gamma_egress S2 pre-assert failed: % dispatch-authorization row(s) violate the recut document-hash rule', v_bad
      using errcode='CLR10';
  end if;
end
$s2_pre$;
alter table clara.egress_dispatch_authorizations
  drop constraint ck_egress_dispatch_authorizations_doc_sha;
alter table clara.egress_dispatch_authorizations
  add constraint ck_egress_dispatch_authorizations_doc_sha check (
    (purpose <> 'wiki_synthesis'      or document_sha256 is null)
    and (purpose <> 'statement_extraction' or document_sha256 is not null)
    and (purpose <> 'witness_extraction' or document_sha256 is not null)
    and (purpose <> 'bank_matching' or document_sha256 is null)
    and (purpose <> 'document_processing' or document_sha256 is not null));

-- =====================================================================================
-- SECTION 3 -- the four client-purpose verbs: widen the HARDCODED in-body allowlist to admit
-- 'document_processing'. The wiki-hold coupling stays purpose-discriminated and BYTE-UNTOUCHED:
-- it fires for p_purpose='wiki_synthesis' only, so document_processing falls through with no
-- hold transition, exactly like statement_extraction/witness_extraction/bank_matching do today.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.grant_client_egress_purpose(p_client uuid,p_purpose text,
    p_evidence_document uuid,p_scope_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_scope_note is null or nullif(btrim(p_scope_note),'') is null then
    raise exception 'typed egress consent is malformed' using errcode='CLR10';
  end if;
  -- 0038 (WCB-R1): the SECOND typed purpose. 'statement_extraction' authorizes the
  -- statement-specific vendor read of a filed bank statement, and nothing else.
  -- F-A3/PR-1c: the FOURTH typed purpose, 'bank_matching'.
  -- F-A7 gamma: the FIFTH typed purpose, 'document_processing' -- the classify lane's
  -- per-client whole-document model read (design SS3.5), document-tied.
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'grant_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'scope_note',p_scope_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm
      and status='active') then
    raise exception 'client is not active in your firm' using errcode='CLR11';
  end if;
  -- A null document, or any document that is not an already-classified, bytes-verified
  -- consent-evidence artifact in this firm, is refused. The owner-declaration path of
  -- 0012(A) is deliberately NOT available for typed consent.
  if p_evidence_document is null or not exists(select 1 from clara.documents
      where id=p_evidence_document and firm_id=c.firm
        and document_kind='consent_evidence' and bytes_verified_at is not null) then
    raise exception 'typed consent evidence must be a verified consent-evidence document in your firm'
      using errcode='CLR28',detail='{"reason":"evidence_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_consents(firm_id,client_id,purpose,scope_note,
        evidence_document_id,granted_by)
      values(c.firm,p_client,p_purpose,btrim(p_scope_note),p_evidence_document,c.actor)
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_consents_one_live' then
      raise exception 'client already has a live typed egress consent for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'grant_client_egress_purpose',null,
    jsonb_build_object('consent',v_id,'client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'op_key',p_op_key));
  -- The evidence document rides in the PAYLOAD, never the typed document_id column -- the
  -- 0014 rule (a consent artifact must not trip the filing-history provenance trigger)
  -- applies identically to typed consent.
  perform clara._append_event(c.firm,'egress.purpose_consent_granted',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',v_id,'purpose',p_purpose,
      'evidence_document_id',p_evidence_document));
  return clara._finish_op(c.firm,'grant_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',v_id,'purpose',p_purpose,'status','live'));
end $$;
alter function clara.grant_client_egress_purpose(uuid,text,uuid,text,text) owner to clara_fn_owner;

create or replace function clara.activate_client_egress_purpose(p_client uuid,p_purpose text,
    p_consent uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_consent is null then
    raise exception 'typed egress activation is malformed' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'activate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'consent',p_consent)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST. Section 7.1 mandates CLR11 for a client not in your firm.
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  if x.id<>p_consent then
    raise exception 'the named consent is not the live typed consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"consent_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_activations(firm_id,client_id,purpose,
        consent_id,activated_by)
      values(c.firm,p_client,p_purpose,x.id,c.actor) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_activations_one_live' then
      raise exception 'client already has a live activation for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  -- 0020 section 4.3 / 0038 (WCB-R1): the coupling is PURPOSE-DISCRIMINATED, keyed on the
  -- client alone. document_processing (like statement_extraction/witness_extraction/
  -- bank_matching) fires no hold transition.
  if p_purpose='wiki_synthesis' then
    perform clara.clear_wiki_synthesis_hold(p_client,'wikirelease:purpose:'||v_id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'activate_client_egress_purpose',null,
    jsonb_build_object('activation',v_id,'consent',x.id,'client',p_client,
      'purpose',p_purpose,'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_activated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',v_id,'consent_id',x.id,
      'purpose',p_purpose,'evidence_document_id',x.evidence_document_id));
  return clara._finish_op(c.firm,'activate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',v_id,'consent_id',x.id,'purpose',p_purpose,
      'status','active'));
end $$;
alter function clara.activate_client_egress_purpose(uuid,text,uuid,text) owner to clara_fn_owner;

create or replace function clara.deactivate_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress deactivation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_activations
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and deactivated_at is null for update;
  if not found then
    raise exception 'no live typed egress activation for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_activation"}';
  end if;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason=btrim(p_reason) where id=x.id;
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='activation_deactivated'
    where consent_id=x.consent_id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  if p_purpose='wiki_synthesis' then
    perform clara.set_wiki_synthesis_hold(p_client,
      'wiki synthesis purpose deactivated','wikihold:purpose:deact:'||x.id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'deactivate_client_egress_purpose',null,
    jsonb_build_object('activation',x.id,'consent',x.consent_id,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_deactivated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',x.id,
      'consent_id',x.consent_id,'purpose',p_purpose,'reason',btrim(p_reason),
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',x.id,'consent_id',x.consent_id,'purpose',p_purpose,
      'status','deactivated'));
end $$;
alter function clara.deactivate_client_egress_purpose(uuid,text,text,text) owner to clara_fn_owner;

create or replace function clara.revoke_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_activation uuid; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress revocation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching','document_processing') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  update clara.client_egress_purpose_consents set revoked_by=c.actor,revoked_at=now(),
    revoke_reason=btrim(p_reason) where id=x.id;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason='typed egress consent revoked'
    where consent_id=x.id and firm_id=c.firm and deactivated_at is null
    returning id into v_activation;
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='consent_revoked'
    where consent_id=x.id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  if p_purpose='wiki_synthesis' then
    perform clara.set_wiki_synthesis_hold(p_client,
      'wiki synthesis purpose consent revoked','wikihold:purpose:'||x.id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'revoke_client_egress_purpose',null,
    jsonb_build_object('consent',x.id,'activation',v_activation,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_consent_revoked',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',x.id,'purpose',p_purpose,
      'activation_id',v_activation,'reason',btrim(p_reason),
      'evidence_document_id',x.evidence_document_id,
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',x.id,'activation_id',v_activation,'purpose',p_purpose,
      'status','revoked'));
end $$;
alter function clara.revoke_client_egress_purpose(uuid,text,text,text) owner to clara_fn_owner;

-- =====================================================================================
-- SECTION 4 -- prepare_egress_dispatch: the document_processing pre-check arm (mirrors
-- statement_extraction's/witness_extraction's exactly -- v_sha REQUIRED). consume_egress_
-- dispatch needs NO change -- its re-binding check is already purpose-generic.
-- =====================================================================================
create or replace function clara.prepare_egress_dispatch(p_firm uuid,p_client uuid,p_purpose text,
    p_event_seq bigint,p_event_type text,p_document_sha256 text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c_dispatch_ttl constant interval := interval '120 seconds';
  v_consent uuid; v_activation uuid; v_id uuid; v_sha text;
begin
  if p_firm is null or p_client is null or p_purpose is null
     or p_event_seq is null or p_event_type is null or btrim(p_event_type)='' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  v_sha := lower(nullif(btrim(coalesce(p_document_sha256,'')),''));
  if v_sha is not null and v_sha !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='wiki_synthesis' and v_sha is not null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='statement_extraction' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='witness_extraction' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- F-A3/PR-1c: bank_matching is NOT document-tied -- the wiki_synthesis arm's shape.
  if p_purpose='bank_matching' and v_sha is not null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- F-A7 gamma: document_processing IS document-tied -- the statement_extraction/
  -- witness_extraction shape (classify reads exactly one document).
  if p_purpose='document_processing' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  select a.id,a.consent_id into v_activation,v_consent
    from clara.client_egress_purpose_activations a
    join clara.client_egress_purpose_consents c
      on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
        and c.purpose=a.purpose
   where a.firm_id=p_firm and a.client_id=p_client and a.purpose=p_purpose
     and a.deactivated_at is null and c.revoked_at is null;
  if v_activation is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  insert into clara.egress_dispatch_authorizations(firm_id,client_id,purpose,consent_id,
      activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
    values(p_firm,p_client,p_purpose,v_consent,v_activation,p_event_seq,p_event_type,
      v_sha,clock_timestamp(),clock_timestamp()+c_dispatch_ttl)
    returning id into v_id;
  return jsonb_build_object('verdict','granted','authorization_id',v_id);
end $$;
alter function clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text) owner to clara_fn_owner;

reset role;

-- =====================================================================================
-- SECTION 5 -- THE FIRM-NARROW FAMILY (D-7). One purpose ('firm_narrow_intake'), two moments
-- ('attribution' | 'onboarding_interview'). Mirrors 0020's client family with firm_id where
-- client_id stood, plus a moment column on all three relations (annexes-1 Annex A verb
-- signatures name p_moment on grant AND activate/deactivate/revoke: the owner MAY sign both
-- moments in one sitting -- "signs ONCE", colloquially -- but each moment is its own
-- consent+activation row so the audit line names exactly which moment was authorized, per D-7).
-- Only owner policy (for all to clara_fn_owner) -- NO human select grant, mirroring 0020's OWN
-- shape for the client family exactly (measured live: client_egress_purpose_consents/
-- _activations/egress_dispatch_authorizations carry no clara_authenticated grant and no second
-- policy -- access is through the audited DEFINER verbs only, never a raw table read).
-- =====================================================================================
create table clara.firm_egress_purpose_consents(
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references clara.firms(id),
  purpose text not null,
  moment text not null,
  scope_note text not null,
  evidence_document_id uuid not null,
  granted_by uuid not null references clara.users(id),
  granted_at timestamptz not null default now(),
  revoked_by uuid references clara.users(id),
  revoked_at timestamptz,
  revoke_reason text,
  constraint ck_firm_egress_purpose_consents_purpose_f_a7 check (purpose in ('firm_narrow_intake')),
  constraint ck_firm_egress_purpose_consents_moment_f_a7 check (moment in ('attribution','onboarding_interview')),
  constraint ck_firm_egress_purpose_consents_scope_note check (btrim(scope_note) <> ''),
  constraint ck_firm_egress_purpose_consents_revocation check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (revoked_at is not null and revoked_by is not null and nullif(btrim(revoke_reason),'') is not null)),
  constraint fk_firm_egress_purpose_consents_evidence foreign key (evidence_document_id, firm_id) references clara.documents(id, firm_id),
  constraint uq_firm_egress_purpose_consents_id_firm_purpose_moment unique (id, firm_id, purpose, moment)
);
create unique index uq_firm_egress_purpose_consents_one_live on clara.firm_egress_purpose_consents(firm_id, purpose, moment) where revoked_at is null;
create index ix_firm_egress_purpose_consents_firm_live on clara.firm_egress_purpose_consents(firm_id, purpose, moment) where revoked_at is null;
alter table clara.firm_egress_purpose_consents enable row level security;
alter table clara.firm_egress_purpose_consents force row level security;
create policy p_firm_egress_purpose_consents_owner on clara.firm_egress_purpose_consents for all to clara_fn_owner using (true) with check (true);
grant all on clara.firm_egress_purpose_consents to clara_fn_owner;

create table clara.firm_egress_purpose_activations(
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references clara.firms(id),
  purpose text not null,
  moment text not null,
  consent_id uuid not null,
  activated_by uuid not null references clara.users(id),
  activated_at timestamptz not null default now(),
  deactivated_by uuid references clara.users(id),
  deactivated_at timestamptz,
  deactivation_reason text,
  constraint ck_firm_egress_purpose_activations_purpose_f_a7 check (purpose in ('firm_narrow_intake')),
  constraint ck_firm_egress_purpose_activations_moment_f_a7 check (moment in ('attribution','onboarding_interview')),
  constraint ck_firm_egress_purpose_activations_deactivation check (
    (deactivated_at is null and deactivated_by is null and deactivation_reason is null)
    or (deactivated_at is not null and deactivated_by is not null and nullif(btrim(deactivation_reason),'') is not null)),
  constraint uq_firm_egress_purpose_activations_id_firm_purpose_moment unique (id, firm_id, purpose, moment),
  constraint fk_firm_egress_purpose_activations_consent foreign key (consent_id, firm_id, purpose, moment) references clara.firm_egress_purpose_consents(id, firm_id, purpose, moment)
);
create unique index uq_firm_egress_purpose_activations_one_live on clara.firm_egress_purpose_activations(firm_id, purpose, moment) where deactivated_at is null;
create index ix_firm_egress_purpose_activations_consent on clara.firm_egress_purpose_activations(consent_id) where deactivated_at is null;
create index ix_firm_egress_purpose_activations_firm_live on clara.firm_egress_purpose_activations(firm_id, purpose, moment) where deactivated_at is null;
alter table clara.firm_egress_purpose_activations enable row level security;
alter table clara.firm_egress_purpose_activations force row level security;
create policy p_firm_egress_purpose_activations_owner on clara.firm_egress_purpose_activations for all to clara_fn_owner using (true) with check (true);
grant all on clara.firm_egress_purpose_activations to clara_fn_owner;

create table clara.firm_egress_dispatch_authorizations(
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references clara.firms(id),
  purpose text not null,
  moment text not null,
  consent_id uuid not null,
  activation_id uuid not null,
  event_seq bigint not null,
  event_type text not null check (btrim(event_type) <> ''),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  invalidated_reason text,
  constraint ck_firm_egress_dispatch_authorizations_purpose_f_a7 check (purpose in ('firm_narrow_intake')),
  constraint ck_firm_egress_dispatch_authorizations_moment_f_a7 check (moment in ('attribution','onboarding_interview')),
  constraint ck_firm_egress_dispatch_authorizations_invalidation check (
    (invalidated_at is null and invalidated_reason is null)
    or (invalidated_at is not null and nullif(btrim(invalidated_reason),'') is not null)),
  constraint ck_firm_egress_dispatch_authorizations_one_terminal check (consumed_at is null or invalidated_at is null),
  constraint fk_firm_egress_dispatch_authorizations_consent foreign key (consent_id, firm_id, purpose, moment) references clara.firm_egress_purpose_consents(id, firm_id, purpose, moment),
  constraint fk_firm_egress_dispatch_authorizations_activation foreign key (activation_id, firm_id, purpose, moment) references clara.firm_egress_purpose_activations(id, firm_id, purpose, moment)
);
create index ix_firm_egress_dispatch_authorizations_open on clara.firm_egress_dispatch_authorizations(consent_id) where consumed_at is null and invalidated_at is null;
alter table clara.firm_egress_dispatch_authorizations enable row level security;
alter table clara.firm_egress_dispatch_authorizations force row level security;
create policy p_firm_egress_dispatch_authorizations_owner on clara.firm_egress_dispatch_authorizations for all to clara_fn_owner using (true) with check (true);
grant all on clara.firm_egress_dispatch_authorizations to clara_fn_owner;

set role clara_fn_owner;

create function clara.grant_firm_egress_purpose(p_purpose text,p_moment text,
    p_evidence_document uuid,p_scope_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_scope_note is null or nullif(btrim(p_scope_note),'') is null then
    raise exception 'typed egress consent is malformed' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('firm_narrow_intake') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  if p_moment is null or p_moment not in ('attribution','onboarding_interview') then
    raise exception 'unknown egress moment'
      using errcode='CLR10',detail='{"reason":"unknown_moment"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'grant_firm_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('purpose',p_purpose,'moment',p_moment,
      'evidence_document',p_evidence_document,'scope_note',p_scope_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- Same evidence discipline as the client family (design SS3.5: "the consent artefacts are
  -- human acts"). Firm-scoped, never client-scoped -- this purpose has no client.
  if p_evidence_document is null or not exists(select 1 from clara.documents
      where id=p_evidence_document and firm_id=c.firm
        and document_kind='consent_evidence' and bytes_verified_at is not null) then
    raise exception 'typed consent evidence must be a verified consent-evidence document in your firm'
      using errcode='CLR28',detail='{"reason":"evidence_mismatch"}';
  end if;
  begin
    insert into clara.firm_egress_purpose_consents(firm_id,purpose,moment,scope_note,
        evidence_document_id,granted_by)
      values(c.firm,p_purpose,p_moment,btrim(p_scope_note),p_evidence_document,c.actor)
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_firm_egress_purpose_consents_one_live' then
      raise exception 'firm already has a live typed egress consent for this purpose and moment'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'grant_firm_egress_purpose',null,
    jsonb_build_object('consent',v_id,'purpose',p_purpose,'moment',p_moment,
      'evidence_document',p_evidence_document,'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.firm_purpose_consent_granted',null,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',v_id,'purpose',p_purpose,
      'moment',p_moment,'evidence_document_id',p_evidence_document));
  return clara._finish_op(c.firm,'grant_firm_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',v_id,'purpose',p_purpose,'moment',p_moment,'status','live'));
end $$;
alter function clara.grant_firm_egress_purpose(text,text,uuid,text,text) owner to clara_fn_owner;

create function clara.activate_firm_egress_purpose(p_purpose text,p_moment text,
    p_consent uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_consent is null then
    raise exception 'typed egress activation is malformed' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('firm_narrow_intake') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  if p_moment is null or p_moment not in ('attribution','onboarding_interview') then
    raise exception 'unknown egress moment'
      using errcode='CLR10',detail='{"reason":"unknown_moment"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'activate_firm_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('purpose',p_purpose,'moment',p_moment,'consent',p_consent)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into x from clara.firm_egress_purpose_consents
    where firm_id=c.firm and purpose=p_purpose and moment=p_moment
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this purpose and moment'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  if x.id<>p_consent then
    raise exception 'the named consent is not the live typed consent for this purpose and moment'
      using errcode='CLR28',detail='{"reason":"consent_mismatch"}';
  end if;
  begin
    insert into clara.firm_egress_purpose_activations(firm_id,purpose,moment,
        consent_id,activated_by)
      values(c.firm,p_purpose,p_moment,x.id,c.actor) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_firm_egress_purpose_activations_one_live' then
      raise exception 'firm already has a live activation for this purpose and moment'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'activate_firm_egress_purpose',null,
    jsonb_build_object('activation',v_id,'consent',x.id,'purpose',p_purpose,'moment',p_moment,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.firm_purpose_activated',null,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',v_id,'consent_id',x.id,
      'purpose',p_purpose,'moment',p_moment,'evidence_document_id',x.evidence_document_id));
  return clara._finish_op(c.firm,'activate_firm_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',v_id,'consent_id',x.id,'purpose',p_purpose,
      'moment',p_moment,'status','active'));
end $$;
alter function clara.activate_firm_egress_purpose(text,text,uuid,text) owner to clara_fn_owner;

create function clara.deactivate_firm_egress_purpose(p_purpose text,p_moment text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress deactivation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('firm_narrow_intake') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  if p_moment is null or p_moment not in ('attribution','onboarding_interview') then
    raise exception 'unknown egress moment'
      using errcode='CLR10',detail='{"reason":"unknown_moment"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'deactivate_firm_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('purpose',p_purpose,'moment',p_moment,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into x from clara.firm_egress_purpose_activations
    where firm_id=c.firm and purpose=p_purpose and moment=p_moment
      and deactivated_at is null for update;
  if not found then
    raise exception 'no live typed egress activation for this purpose and moment'
      using errcode='CLR28',detail='{"reason":"no_activation"}';
  end if;
  update clara.firm_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason=btrim(p_reason) where id=x.id;
  update clara.firm_egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='activation_deactivated'
    where consent_id=x.consent_id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  perform clara._audit(c.firm,c.actor,null,null,'deactivate_firm_egress_purpose',null,
    jsonb_build_object('activation',x.id,'consent',x.consent_id,'purpose',p_purpose,
      'moment',p_moment,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.firm_purpose_deactivated',null,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',x.id,
      'consent_id',x.consent_id,'purpose',p_purpose,'moment',p_moment,
      'reason',btrim(p_reason),'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'deactivate_firm_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',x.id,'consent_id',x.consent_id,'purpose',p_purpose,
      'moment',p_moment,'status','deactivated'));
end $$;
alter function clara.deactivate_firm_egress_purpose(text,text,text,text) owner to clara_fn_owner;

create function clara.revoke_firm_egress_purpose(p_purpose text,p_moment text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_activation uuid; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress revocation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('firm_narrow_intake') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  if p_moment is null or p_moment not in ('attribution','onboarding_interview') then
    raise exception 'unknown egress moment'
      using errcode='CLR10',detail='{"reason":"unknown_moment"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revoke_firm_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('purpose',p_purpose,'moment',p_moment,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into x from clara.firm_egress_purpose_consents
    where firm_id=c.firm and purpose=p_purpose and moment=p_moment
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this purpose and moment'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  update clara.firm_egress_purpose_consents set revoked_by=c.actor,revoked_at=now(),
    revoke_reason=btrim(p_reason) where id=x.id;
  update clara.firm_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason='typed egress consent revoked'
    where consent_id=x.id and firm_id=c.firm and deactivated_at is null
    returning id into v_activation;
  update clara.firm_egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='consent_revoked'
    where consent_id=x.id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  perform clara._audit(c.firm,c.actor,null,null,'revoke_firm_egress_purpose',null,
    jsonb_build_object('consent',x.id,'activation',v_activation,'purpose',p_purpose,
      'moment',p_moment,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.firm_purpose_consent_revoked',null,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',x.id,'purpose',p_purpose,
      'moment',p_moment,'activation_id',v_activation,'reason',btrim(p_reason),
      'evidence_document_id',x.evidence_document_id,
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'revoke_firm_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',x.id,'activation_id',v_activation,'purpose',p_purpose,
      'moment',p_moment,'status','revoked'));
end $$;
alter function clara.revoke_firm_egress_purpose(text,text,text,text) owner to clara_fn_owner;

-- prepare_firm_egress_dispatch: clara_runtime-floored (no _human_ctx), mirrors prepare_egress_
-- dispatch's uniform 'unknown' refusal shape exactly (0020 SS3.3 non-oracle rule): null firm,
-- unknown purpose, unknown/wrong moment, malformed or missing sha, no live activation for the
-- (firm,purpose,moment) triple -- one indistinguishable payload.
create function clara.prepare_firm_egress_dispatch(p_firm uuid,p_purpose text,p_moment text,
    p_event_seq bigint,p_event_type text,p_document_sha256 text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c_dispatch_ttl constant interval := interval '120 seconds';
  v_consent uuid; v_activation uuid; v_id uuid; v_sha text;
begin
  if p_firm is null or p_purpose is null or p_moment is null
     or p_event_seq is null or p_event_type is null or btrim(p_event_type)='' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose not in ('firm_narrow_intake') then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_moment not in ('attribution','onboarding_interview') then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  v_sha := lower(nullif(btrim(coalesce(p_document_sha256,'')),''));
  -- Firm-narrow is always document-tied (an unfiled document, or an interview attachment).
  if v_sha is null or v_sha !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  select a.id,a.consent_id into v_activation,v_consent
    from clara.firm_egress_purpose_activations a
    join clara.firm_egress_purpose_consents c
      on c.id=a.consent_id and c.firm_id=a.firm_id and c.purpose=a.purpose and c.moment=a.moment
   where a.firm_id=p_firm and a.purpose=p_purpose and a.moment=p_moment
     and a.deactivated_at is null and c.revoked_at is null;
  if v_activation is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  insert into clara.firm_egress_dispatch_authorizations(firm_id,purpose,moment,consent_id,
      activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
    values(p_firm,p_purpose,p_moment,v_consent,v_activation,p_event_seq,p_event_type,
      v_sha,clock_timestamp(),clock_timestamp()+c_dispatch_ttl)
    returning id into v_id;
  return jsonb_build_object('verdict','granted','authorization_id',v_id);
end $$;
alter function clara.prepare_firm_egress_dispatch(uuid,text,text,bigint,text,text) owner to clara_fn_owner;

reset role;

-- MEASURED (full-estate battery caught this): `create function` (unlike the CREATE OR REPLACE
-- CoRs above, which preserve their pre-existing ACL untouched) grants PUBLIC EXECUTE by
-- Postgres's own default on every brand-new function, and that default survived `set role
-- clara_fn_owner` here regardless of 0007's `alter default privileges for role clara_fn_owner
-- in schema clara revoke execute on functions from public`. Explicit revoke, matching 0094's
-- own belt-and-suspenders idiom (`revoke all on function clara.record_llm_usage_event(...) from
-- public`) rather than trusting the schema-level default alone.
revoke all on function clara.grant_firm_egress_purpose(text,text,uuid,text,text) from public;
revoke all on function clara.activate_firm_egress_purpose(text,text,uuid,text) from public;
revoke all on function clara.deactivate_firm_egress_purpose(text,text,text,text) from public;
revoke all on function clara.revoke_firm_egress_purpose(text,text,text,text) from public;
revoke all on function clara.prepare_firm_egress_dispatch(uuid,text,text,bigint,text,text) from public;

grant execute on function clara.grant_firm_egress_purpose(text,text,uuid,text,text) to clara_authenticated;
grant execute on function clara.activate_firm_egress_purpose(text,text,uuid,text) to clara_authenticated;
grant execute on function clara.deactivate_firm_egress_purpose(text,text,text,text) to clara_authenticated;
grant execute on function clara.revoke_firm_egress_purpose(text,text,text,text) to clara_authenticated;
grant execute on function clara.prepare_firm_egress_dispatch(uuid,text,text,bigint,text,text) to clara_runtime;

-- =====================================================================================
-- SECTION 6 -- _enqueue_invoice_facts_core: THE CLASSIFY CONSENT GATE, AT ENQUEUE (D-18/AB-4).
-- Added as a new elsif arm in the SAME per-lane consent-gate chain the statement/witness arms
-- already occupy (byte-unmoved above and below the insertion point). Follows the statement-lane
-- mechanism exactly: flip an in-flight queued task to the gate's verdict, else an idempotent
-- re-read of an existing terminal receipt, else a fresh terminal-failed insert; a named event
-- reaches the spine on the two ACTING branches only (never the re-read). Never a raise -- this
-- function runs inside file_document / finalize_document_intake / confirm_attribution_candidate
-- / approve_wrong_client_correction.
-- =====================================================================================
create or replace function clara._enqueue_invoice_facts_core(p_document uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'clara', 'pg_temp'
 as $$
declare
  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;
  v_lane text; v_engine text; v_task_status text;
  v_engine_kind text; v_stmt_clients uuid[]; v_stmt_client uuid; v_gate text; v_flip int;
begin
  select * into d from clara.documents where id=p_document for update;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  -- 0014: a consent-evidence document is a LEGAL artifact — never facts-extracted.
  if d.document_kind='consent_evidence' then
    return jsonb_build_object('document_id',p_document,'status','skipped_consent_evidence');
  end if;
  if exists(select 1 from clara.document_filings df
      where df.document_id=p_document and df.retired_at is null)
     and not exists(select 1 from clara.document_filings df
       join clara.clients oc on oc.id=df.client_id and oc.status='active'
       where df.document_id=p_document and df.retired_at is null) then
    return jsonb_build_object('document_id',p_document,
      'status','skipped_client_onboarding');
  end if;
  -- 0015: mime chooses the engine family. 0016 (P3/WA21-R7): the DOCUMENT KIND
  -- gates the facts engines — only invoice-shaped kinds reach invoice_facts;
  -- a NULL kind classifies FIRST; xml stays rule-classified into the local lane.
  -- 0038 (design 4.3): 'bank_statement' now has TWO homes -- the vendor OCR lane for a
  -- pdf/image and the free local parse lane for a csv/ofx export.
  if lower(coalesce(d.mime_type,''))='application/pdf'
     or lower(coalesce(d.mime_type,'')) like 'image/%' then
    if d.document_kind is null then
      v_lane:='classify'; v_engine:='clara-classify-llm:v1';
    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then
      -- F-A1 PR-3 CUTOVER (design SS3.8/D9): the invoice path now mints llm_witness
      -- DIRECTLY -- NO DUAL-RUN. Exactly the SAME document-kind set the invoice_facts arm
      -- served (mirrored above, never widened here). F-A2 OPENER 2: the engine identity moves
      -- to :v2 because witnessFacts.v2 is a NEW frozen prompt closure and its reads answer
      -- different questions -- v_engine MUST string-equal WITNESS_ENGINE_SNAPSHOT.engineId in
      -- the witnessFacts.v2 services module -- battery cell f-a2.engine-literal reads both
      -- sides and asserts equality.
      v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v2';
    elsif d.document_kind='bank_statement' then
      -- 0038 arm 1 closed the bank_statement -> skipped_kind dead end 0026:392-410 left
      -- behind, on the vendor OCR read. F-A2 WINDOW B (the ACTIVATION, design SS3.7) re-aims
      -- it at the WITNESS PAIR: the same lane, a different engine identity.
      -- THE LANE DOES NOT MOVE, and that is 0098's own LANE DECISION (0098:120-138), not an
      -- omission: _invoice_fact_state keys the witness regime on lane llm_witness, so a
      -- statement pair there would be resolved as an INVOICE corroboration, and the invoice
      -- witness workflow claims that lane BY LANE ALONE and would read a statement with
      -- invoice prompts. Staying on statement_facts also keeps this task inside the
      -- enqueue-time page-budget reservation set (0098:114-118).
      -- v_engine MUST string-equal STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId in the
      -- statementFacts.v2 services module: the workflow compares the task's stamp against its
      -- own snapshot BEFORE any egress and WAITS on a mismatch rather than sending bytes under
      -- a receipt naming a model it did not call (0098:154-159), so a drifted literal STALLS
      -- the lane instead of mis-stamping it. Battery cell f-a2.activation-engine-literal reads
      -- both sides independently and asserts equality.
      v_lane:='statement_facts'; v_engine:='llm-openai:gpt-5.6-terra:stmt-witness-v1';
    else
      -- (adjudication #11): the skipped_kind receipt lives on the task trail —
      -- a terminal failed row (never claimed, attempt_count 0 so it never
      -- consumes attempts), reused idempotently on re-invocation.
      select id into v_task from clara.document_processing_tasks
        where document_id=p_document and lane='invoice_facts'
          and status='failed' and error_code='skipped_kind'
        order by id limit 1;
      if v_task is null then
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane='invoice_facts';
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,
            v_version,'invoice_facts','failed','skipped_kind',now())
          returning id into v_task;
      end if;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','skipped_kind','document_kind',d.document_kind);
    end if;
  elsif lower(coalesce(d.mime_type,'')) in ('application/xml','text/xml') then
    -- Delta-review round 2 (2026-07-31): the XML arm was KIND-BLIND -- a bank_statement
    -- xml rode the myinvois local lane into the INVOICE parser (wrong worker, wrong
    -- events, a phantom autodraft wake if it happened to parse). No xml statement parser
    -- exists in C-b (the structured lane is csv/ofx by design 4.3), so the honest verdict
    -- is the same terminal skipped_type a csv non-statement gets: never a misroute.
    if d.document_kind='bank_statement' then
      return jsonb_build_object('document_id',p_document,'status','skipped_type');
    end if;
    v_lane:='local_facts'; v_engine:='clara-myinvois:v1';
  elsif lower(coalesce(d.mime_type,'')) in ('text/csv','application/csv',
      'application/x-ofx','application/ofx') then
    -- 0038 arm 2 (design 4.3): the csv/ofx mimes JOIN the dispatch. They dead-ended at
    -- skipped_type before the kind test could ever run. ONLY a bank statement routes; every
    -- other kind keeps the byte-identical skipped_type verdict it has today, so nothing that
    -- is not a statement changes behaviour.
    if d.document_kind='bank_statement' then
      v_lane:='statement_parse'; v_engine:='clara-statement-parse:v1';
    else
      return jsonb_build_object('document_id',p_document,'status','skipped_type');
    end if;
  else
    return jsonb_build_object('document_id',p_document,'status','skipped_type');
  end if;
  if v_lane='classify' then
    -- a DONE classify verdict with the kind still NULL = the low-confidence
    -- hold: a human resolves it (set_document_kind / the review question);
    -- never re-enqueue in a loop.
    if exists(select 1 from clara.document_extractions e
        where e.document_id=p_document and e.engine_kind='doc_classify'
          and e.status='done') then
      return jsonb_build_object('document_id',p_document,'status','classify_low_confidence');
    end if;
  else
    -- 0038 (design 4.3): PER-LANE engine-kind. This short-circuit was hard-coded to
    -- 'invoice_facts', which is correct for invoice_facts AND for local_facts (both settle an
    -- invoice_facts extraction) and WRONG for either statement lane -- a fully ingested
    -- statement would read as un-extracted on every re-fire and re-buy a vendor read. The map
    -- preserves the two existing lanes exactly and names the two new ones.
    v_engine_kind := case when v_lane in ('statement_facts','statement_parse')
                       then 'statement_facts'  -- BOTH statement lanes settle a
                       -- statement_facts extraction (the lane records how the read was
                       -- bought; the engine_kind what it is -- the 0026:709 precedent)
                       when v_lane='llm_witness'
                       then 'llm_text_facts'  -- F-A1 PR-3: the CANONICAL witness row --
                       -- a done text row proves a done PAIR (one atomic writer transaction,
                       -- 0095 section 8), so a re-fire is suppressed the moment the pair lands.
                       else 'invoice_facts' end;
    select e.id into v_task from clara.document_extractions e
      where e.document_id=p_document and e.engine_kind=v_engine_kind and e.status='done'
      order by e.version_n desc limit 1;
    -- F-A1 PR-3 (M-4, RULED): for the invoice-shaped lane ONLY, a done LEGACY extraction ALSO
    -- suppresses -- v_engine_kind above already names the witness side (llm_text_facts); this
    -- is the legacy side of the EITHER-REGIME check, consulted only when the witness lookup
    -- just found nothing.
    if v_task is null and v_lane='llm_witness' then
      select e.id into v_task from clara.document_extractions e
        where e.document_id=p_document and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc limit 1;
    end if;
    if v_task is not null then
      return jsonb_build_object('document_id',p_document,'status','already_completed',
        'extraction_id',v_task);
    end if;
  end if;
  -- 0038 (design 4.3/4.4, WCB-R1): THE ENQUEUE-TIME TYPED-CONSENT GATE, statement lanes only.
  -- It is here rather than in the claim body because the ratified 0020 section 6 byte-identity
  -- battery asserts claim_document_processing_task carries no call edge into the typed-consent
  -- surface — and because enqueue is the earlier, more honest place: an unauthorized client
  -- should never have a task queued in their name at all. Both verdicts write the terminal
  -- NEVER-CLAIMED failed receipt (the skipped_kind idiom), never a raise: this function runs
  -- inside file_document / finalize_document_intake / confirm_attribution_candidate /
  -- approve_wrong_client_correction, and a raise would abort an unrelated filing transaction.
  --
  -- ORDERING, decided here because the design does not fix it: the gate runs AFTER the
  -- already_completed short-circuit (an ingested statement raises no consent question and must
  -- not generate noise on a re-fire) and BEFORE the in-flight short-circuit. The other order
  -- has a real hole: a statement enqueued while one client held it, then filed to a SECOND
  -- client, would hit the in-flight branch and return the queued task, so the vendor read
  -- would proceed on a document with no answerable consent client. A re-fire whose gate now
  -- fails should say so even while a task is queued.
  if v_lane in ('statement_facts','statement_parse') then
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='statement_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then
      -- Zero active filings: no client exists who could have authorized this read. Fail closed.
      v_gate:='consent_inactive';
    else
      v_stmt_client:=v_stmt_clients[1];
      -- F-A2 WINDOW B (the ACTIVATION): the statement lane's typed consent is now keyed on the
      -- purpose the witness pair actually egresses under, not on the retiring vendor-OCR one.
      -- NO NEW CONSENT SURFACE IS NEEDED: the activation relation is keyed on
      -- (firm_id, client_id, purpose) ALONE -- no lane, no document_kind, no engine column
      -- (0038:5981-5987) -- so the activations already on file for the invoice witness pair
      -- answer this lookup unchanged. THIS ARM'S OWN REFUSAL VOCABULARY IS UNCHANGED
      -- (statement_multi_client / consent_inactive, 0098:161-165) and so is its
      -- document.statement_facts_failed emit; only the purpose literal moves. The retiring
      -- purpose STAYS REGISTERED in the purpose CHECKs -- historical authorization rows
      -- reference it and drops are BY NAME (the 0038:5462 contract).
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='witness_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='consent_inactive';
      end if;
    end if;
    if v_gate is not null then
      -- AS-BUILT LADDER FIX (2026-07-31): the gate ACTS ON any in-flight queued task rather
      -- than writing a receipt beside it -- the ordering rationale above promises the vendor
      -- read stops, so it stops: the queued row flips to the gate verdict in this same
      -- transaction (never-claimed failed rows are legal for both gate codes -- the widened
      -- binding CHECK). A running task is past claiming and settles through its own persist.
      update clara.document_processing_tasks
        set status='failed', error_code=v_gate, finished_at=now()
        where document_id=p_document and lane=v_lane and status='queued';
      get diagnostics v_flip = row_count;
      if v_flip = 0 then
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
        if v_task is not null then
          -- Re-read of an EXISTING terminal receipt: this call acted on nothing, so it
          -- emits nothing (delta-review round 2, 2026-07-31: the unconditional emit here
          -- re-fired on every dark re-try and, picked by uuid order, could name an older
          -- task than the one the verdict actually acted on). The verdict reached the
          -- spine when its receipt was minted; re-reads only report it.
          return jsonb_build_object('task_id',v_task,'document_id',p_document,
            'status','failed','reason',v_gate);
        end if;
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane;
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,v_engine,'{}'::jsonb,
            v_version,v_lane,'failed',v_gate,now())
          returning id into v_task;
      else
        -- The flip acted: name the newest flipped row (version order, never uuid order).
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
      end if;
      -- 0038 as-built fix (2026-07-31): every statement-lane terminal receipt this core
      -- mints reaches the spine as the STATEMENT twin with its reason -- and EXACTLY ONCE
      -- per verdict instance: only the two acting branches (the flip, the fresh insert)
      -- reach this emit; the re-read branch returned above. The wrapper
      -- (enqueue_invoice_facts, recut in E2b) no longer emits its invoice twin for
      -- statement lanes, so this is the single emit site on every caller path --
      -- file_document's direct core calls included.
      perform clara._append_event(d.firm_id,'document.statement_facts_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  elsif v_lane='llm_witness' then
    -- F-A1 PR-1 (design SS3.5/SS6, wall 6): the SAME enqueue-time typed-consent gate, keyed
    -- on purpose='witness_extraction' instead of 'statement_extraction', with its OWN named
    -- refusal codes (wall 7) rather than a reuse of the statement family's bare literals --
    -- witness and statement consent are granted independently, so the codes must stay
    -- distinguishable. INERT AT PR-1: nothing in this body (or anywhere else at this
    -- frontier) ever assigns v_lane:='llm_witness' -- no mime/kind arm mints it yet, and the
    -- lane CHECK plus enqueueForLane's runtime allowlist keep an old image from reaching this
    -- branch even by accident. Wired now so the gate exists the moment PR-3's router recut
    -- adds the classification arm, rather than landing a second CoR on this pinned body then.
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='witness_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then
      -- Zero active filings: no client exists who could have authorized this read. Fail closed.
      v_gate:='witness_consent_inactive';
    else
      v_stmt_client:=v_stmt_clients[1];
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='witness_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='witness_consent_inactive';
      end if;
    end if;
    if v_gate is not null then
      update clara.document_processing_tasks
        set status='failed', error_code=v_gate, finished_at=now()
        where document_id=p_document and lane=v_lane and status='queued';
      get diagnostics v_flip = row_count;
      if v_flip = 0 then
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
        if v_task is not null then
          return jsonb_build_object('task_id',v_task,'document_id',p_document,
            'status','failed','reason',v_gate);
        end if;
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane;
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,v_engine,'{}'::jsonb,
            v_version,v_lane,'failed',v_gate,now())
          returning id into v_task;
      else
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
      end if;
      perform clara._append_event(d.firm_id,'document.llm_witness_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  elsif v_lane='classify' then
    -- F-A7 gamma (D-18/AB-4): THE CLASSIFY CONSENT GATE, at enqueue, following the same
    -- statement-lane mechanism above. TWO populations, per design SS3.5: a FILED document
    -- requires its client's live 'document_processing' typed consent+activation; an UNFILED
    -- document (the pre-activation class, D-21) requires the firm's live firm-narrow
    -- 'attribution'-moment activation. Either verdict is a terminal never-claimed failed
    -- receipt, never a raise.
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='document_processing_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=1 then
      v_stmt_client:=v_stmt_clients[1];
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='document_processing'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='document_processing_consent_inactive';
      end if;
    else
      -- Zero active filings: the pre-activation document class (D-21). The firm-narrow
      -- 'attribution' moment authorizes classify on an unfiled document; it is firm-scoped,
      -- so no multi-client ambiguity is possible here by construction.
      if not exists(select 1 from clara.firm_egress_purpose_activations a
          join clara.firm_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.purpose=a.purpose and c.moment=a.moment
          where a.firm_id=d.firm_id and a.purpose='firm_narrow_intake' and a.moment='attribution'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='firm_narrow_consent_inactive';
      end if;
    end if;
    if v_gate is not null then
      update clara.document_processing_tasks
        set status='failed', error_code=v_gate, finished_at=now()
        where document_id=p_document and lane=v_lane and status='queued';
      get diagnostics v_flip = row_count;
      if v_flip = 0 then
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
        if v_task is not null then
          return jsonb_build_object('task_id',v_task,'document_id',p_document,
            'status','failed','reason',v_gate);
        end if;
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane;
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,v_engine,'{}'::jsonb,
            v_version,v_lane,'failed',v_gate,now())
          returning id into v_task;
      else
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
      end if;
      perform clara._append_event(d.firm_id,'document.classify_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  end if;
  select * into t from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane
      and status in ('queued','held_egress','running')
    order by id limit 1;
  if found then
    return jsonb_build_object('task_id',t.id,'document_id',p_document,'status',t.status);
  end if;
  select coalesce(sum(attempt_count),0)::int,
         coalesce(max(version_n),0)+1
    into v_attempts,v_version from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane;
  if v_attempts >= 3 then
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,finished_at)
      values(d.firm_id,p_document,v_engine,'{}'::jsonb,
        v_version,v_lane,'failed','attempt_cap',now()) returning id into v_task;
    -- 0038 as-built fix (2026-07-31, regression-cells lane finding): THIS branch, not the
    -- claim-time belt, is the one a capped statement actually reaches -- the running attempt
    -- sum already reads 3 when the next enqueue fires, so the pre-fail intercepts before any
    -- claim exists to emit. Without an emit here the statement feed never learns its document
    -- died. Statement lanes only: the invoice lane's enqueue-time cap has been event-silent
    -- since 0026, and lighting it now would wake the autodraft consumer on a path Wave A
    -- never exercised -- that silence stays, recorded here as a pre-existing residual.
    if v_lane in ('statement_facts','statement_parse') then
      perform clara._append_event(d.firm_id, 'document.statement_facts_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason','attempt_cap'));
    end if;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,
      'status','failed','reason','attempt_cap');
  end if;
  insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
      version_n,lane,status)
    values(d.firm_id,p_document,v_engine,'{}'::jsonb,
      v_version,v_lane,'queued')
    on conflict do nothing returning id into v_task;
  if v_task is null then
    -- 0026 (amendment A11): the widened (document_id,engine_id,version_n,lane) key means a
    -- conflict HERE is now a genuine same-lane duplicate — a cross-lane collision is
    -- structurally impossible, lane joins the key. The exact colliding row must exist
    -- regardless of its current status (it may already be done/failed by the time we look
    -- again); silence hid this for the product's whole life, so an absent row here is
    -- impossible-state-loud, not a null task_id.
    select id,status into v_task,v_task_status from clara.document_processing_tasks
      where document_id=p_document and engine_id=v_engine and version_n=v_version and lane=v_lane;
    if v_task is null then
      raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,lane=%) but no row exists at that key',
        p_document,v_engine,v_version,v_lane using errcode='CLR35';
    end if;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',v_task_status);
  end if;
  -- Only the AZURE lanes consume the page budget; classify, the local parse and the local
  -- statement parse reserve nothing. 0038 adds statement_facts to the reserving set, which is
  -- what "the statement lane joins every existing spend control" means concretely.
  if v_lane in ('invoice_facts','statement_facts') then
    v_pages := greatest(coalesce(d.page_count,1),1);
    begin
      perform clara._reserve_processing_call(v_task,v_pages);
    exception when sqlstate 'CLR18' then
      update clara.document_processing_tasks set status='failed',error_code='budget',
        finished_at=now() where id=v_task;
      -- 0038 as-built fix (2026-07-31): the statement lane's budget verdict reaches the
      -- spine as the STATEMENT twin (single emit site -- the wrapper, recut in E2b,
      -- suppresses its invoice twin for statement lanes). The invoice lane keeps its
      -- pre-existing shape: silent here, emitted by the wrapper.
      if v_lane='statement_facts' then
        perform clara._append_event(d.firm_id,'document.statement_facts_failed',
          null,null,null,null,
          null,p_document,null,jsonb_build_object('task_id',v_task,'reason','budget'));
      end if;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason','budget');
    end;
  end if;
  return jsonb_build_object('task_id',v_task,'document_id',p_document,'status','queued');
end $$;

-- =====================================================================================
-- SECTION 7 -- persist_document_extraction: THE FIRM-NARROW OUTPUT WALL (design SS3.5, cell 36).
-- See the file header's HONEST NOTE: v_ekind can only be 'ocr' or 'structured_parse' at THIS
-- frontier (the lane guard immediately below refuses every other lane before v_ekind is ever
-- computed), so the fact-generation branch of this new check is INERT under every caller
-- reachable today -- wired ahead of its router in the same posture 0090 shipped llm_witness in.
-- The negative twin (an OCR/structured_parse kind proceeds regardless of firm-narrow-only) IS
-- forceable and is what the battery actually exercises end-to-end.
-- =====================================================================================
create or replace function clara.persist_document_extraction(p_task uuid, p_status text, p_page_count integer, p_envelope jsonb, p_regions jsonb, p_error_code text, p_vendor_op_ref text, p_op_key text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'clara', 'pg_temp'
 as $$
declare
  t record; v_dedupe jsonb; v_ext uuid; v_event text; elem jsonb; v_ekind text;
  v_opening_fact jsonb; v_opening_account text; v_opening_side text;
  v_opening_amount bigint; v_region_money bigint; v_derived record;
  v_derived_found boolean; v_client_scoped boolean;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task is not running' using errcode='CLR16'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  -- 0026 Q1 (O-round confirmation, Q-round finding): the lane admission guard moves
  -- AHEAD of _reserve_op — t.lane is task-intrinsic and never changes for a given task,
  -- so a structurally invalid call must be refused on EVERY invocation, replay included.
  -- Before this fix, the guard sat AFTER _reserve_op (below), and _reserve_op's own
  -- replay branch returns an EXISTING successful receipt for a repeated op_key before
  -- any business check runs. A pre-0026 op_key that had already succeeded against a
  -- misrouted facts task — back when the old code silently mapped it onto
  -- engine_kind='structured_parse' instead of refusing — would replay that STALE SUCCESS
  -- forever, never reaching the new guard at all. 'none' and 'classify' keep their own
  -- specific, later refusals unchanged (they never had this vulnerability — they have
  -- always refused, never silently mis-mapped) — this early check only widens to catch
  -- the facts lanes (invoice_facts/local_facts) and any future lane value this function
  -- has no opinion on, before _reserve_op ever sees the call.
  if t.lane not in ('ocr','structured_parse','none','classify') then
    raise exception 'persist_document_extraction only settles ocr/structured_parse tasks — % tasks are settled by persist_invoice_facts', t.lane
      using errcode='CLR16';
  end if;
  v_dedupe:=clara._reserve_op(t.firm_id,'persist_document_extraction',p_op_key,
    clara._hash(jsonb_build_object('task',p_task,'status',p_status,'pages',p_page_count,
      'envelope',p_envelope,'regions',p_regions,'error',p_error_code,'vendor',p_vendor_op_ref)));
  if v_dedupe is not null then return v_dedupe; end if;
  if t.status<>'running' then raise exception 'processing task is not running' using errcode='CLR16'; end if;
  if p_status not in ('done','failed') then raise exception 'extraction status must be done/failed' using errcode='CLR10'; end if;
  if t.lane='none' then raise exception 'store-only tasks do not create extractions' using errcode='CLR16'; end if;
  -- 0016 P3: classify verdicts are settled ONLY by classify_document (the
  -- audited writer) — never through the generic persist path (which would
  -- stamp an attribution-visible engine_kind).
  if t.lane='classify' then
    raise exception 'classify tasks are settled by classify_document' using errcode='CLR16';
  end if;
  v_ekind:=case when t.lane='ocr' then 'ocr' else 'structured_parse' end;
  -- F-A7 gamma (design SS3.5, cell 36): THE FIRM-NARROW OUTPUT WALL. A firm-narrow-only
  -- authorization may never settle a fact-generation extraction (invoice_facts/
  -- statement_facts/llm_text_facts/llm_vision_facts) -- see the file header's HONEST NOTE:
  -- v_ekind above can only be 'ocr' or 'structured_parse' given the lane guard already
  -- passed, so this conjunct is unreachable under every caller live today. Wired now so the
  -- wall exists the moment a future lane's engine_kind could ever reach this function.
  if p_status='done' and v_ekind in ('invoice_facts','statement_facts','llm_text_facts','llm_vision_facts') then
    v_client_scoped := exists(
      select 1 from clara.document_filings df
        join clara.client_egress_purpose_activations a on a.client_id=df.client_id and a.firm_id=df.firm_id
        join clara.client_egress_purpose_consents c
          on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id and c.purpose=a.purpose
       where df.document_id=t.document_id and df.retired_at is null
         and a.deactivated_at is null and c.revoked_at is null);
    if not v_client_scoped then
      raise exception 'a firm-narrow-only authorization cannot settle a fact-generation extraction'
        using errcode='CLR28',detail='{"reason":"firm_narrow_output_forbidden"}';
    end if;
  end if;
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(t.firm_id,t.document_id,t.engine_id,v_ekind,
      t.version_n,p_status,p_page_count,coalesce(p_envelope,'{}'::jsonb))
    on conflict(document_id,engine_id,version_n,engine_kind) do nothing returning id into v_ext;
  if v_ext is null then
    -- 0026: engine_kind joins the key (document_extractions' unique key widened to
    -- (document_id,engine_id,version_n,engine_kind)) — a conflict here is now a genuine
    -- same-kind duplicate, never a cross-lane/cross-kind collision. The exact colliding row
    -- must exist.
    select id into v_ext from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind=v_ekind;
    if v_ext is null then
      raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,kind=%) but no row exists at that key',
        t.document_id,t.engine_id,t.version_n,v_ekind using errcode='CLR35';
    end if;
  elsif p_status='done' then
    for elem in select value from jsonb_array_elements(coalesce(p_regions,'[]'::jsonb)) loop
      if v_ekind='structured_parse'
         and (lower(coalesce(elem->>'field_path','')) like '%tin%'
           or lower(coalesce(elem->>'field_path','')) like '%ssm%'
           or lower(coalesce(elem->>'field_path','')) like '%brn%'
           or lower(coalesce(elem->>'field_path','')) like '%account%')
         and lower(coalesce(elem->>'field_path','')) not in
             ('myinvois.supplier_tin','myinvois.supplier_brn') then
        raise exception 'structured_parse attribution field_path % is not on the allowlist',
          elem->>'field_path'
          using errcode='CLR10',detail='{"reason":"attribution_field_not_allowed"}';
      end if;
      -- [R3-F1] Derive the fact from the stored evidence first.
      v_opening_fact:=null; v_opening_account:=null; v_opening_side:=null;
      v_opening_amount:=null; v_region_money:=null;
      begin
        v_region_money:=nullif(elem->>'monetary_cents','')::bigint;
      exception when others then
        raise exception 'opening extraction monetary evidence is malformed'
          using errcode='CLR31',
            detail='{"reason":"opening_extraction_evidence_malformed"}';
      end;
      select * into v_derived from clara._derive_opening_region_fact(
        elem->>'field_path',elem->>'text_content',v_region_money);
      v_derived_found:=found;
      if elem ? 'opening_fact' then
        v_opening_fact:=elem->'opening_fact';
        if jsonb_typeof(v_opening_fact)<>'object' then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end if;
        begin
          v_opening_account:=nullif(btrim(v_opening_fact->>'account_code'),'');
          v_opening_side:=nullif(v_opening_fact->>'side','');
          v_opening_amount:=nullif(v_opening_fact->>'amount_cents','')::bigint;
        exception when others then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end;
        if v_opening_account is null
           or v_opening_side not in ('debit','credit')
           or v_opening_amount is null or v_opening_amount<=0 then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end if;
        if not v_derived_found then
          raise exception 'opening extraction fact has no independent evidence'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_unverifiable"}';
        end if;
        if v_opening_account is distinct from v_derived.account_code
           or v_opening_amount is distinct from v_derived.amount_cents
           or v_opening_side is distinct from v_derived.side then
          raise exception 'opening extraction fact contradicts independent evidence'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_mismatch"}';
        end if;
      end if;
      if v_derived_found then
        v_opening_account:=v_derived.account_code;
        v_opening_amount:=v_derived.amount_cents;
        v_opening_side:=v_derived.side;
      else
        v_opening_account:=null; v_opening_amount:=null; v_opening_side:=null;
      end if;
      insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
          text_content,engine_confidence,monetary_raw,monetary_cents,
          opening_account_code,opening_amount_cents,opening_side)
        values(t.firm_id,v_ext,elem->>'locator_kind',coalesce(elem->'locator','{}'::jsonb),
          elem->>'field_path',elem->>'text_content',(elem->>'engine_confidence')::numeric,
          elem->>'monetary_raw',
          coalesce(v_region_money,v_opening_amount),
          v_opening_account,v_opening_amount,v_opening_side);
    end loop;
  end if;
  update clara.document_processing_tasks set status=p_status,error_code=case when p_status='failed' then p_error_code end,
    vendor_op_ref=p_vendor_op_ref,finished_at=now() where id=p_task;
  update clara.documents set extraction_status=p_status,page_count=p_page_count where id=t.document_id;
  if p_status='done' then perform clara._settle_document_reservation(t.firm_id,p_task,coalesce(p_page_count,0));
  else perform clara._refund_document_reservation(t.firm_id,
    (select intake_id from clara.document_ingest_reservations where task_id=p_task),coalesce(p_error_code,'engine_error')); end if;
  perform clara._audit(t.firm_id,null,null,null,'persist_document_extraction',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'extraction',v_ext,'status',p_status,'op_key',p_op_key));
  v_event:=case when p_status='done' then 'document.extraction_completed' else 'document.extraction_failed' end;
  perform clara._append_event(t.firm_id,v_event,null,null,null,null,null,t.document_id,null,
    jsonb_build_object('extraction_id',v_ext,'engine_id',t.engine_id,'version_n',t.version_n));
  return clara._finish_op(t.firm_id,'persist_document_extraction',p_op_key,
    jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status',p_status));
end $$;
alter function clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text) owner to clara_fn_owner;

-- =====================================================================================
-- SECTION 8 -- classify_document / set_document_kind: 'identity_document' joins BOTH in-body
-- kind lists (AB-5/D-9). NOT a DB_REFUSED_KINDS member anywhere (that vocabulary is runtime,
-- PR-rho's) -- the refusal is B8's DB fact, not a prompt instruction (constraint 2).
-- =====================================================================================
create or replace function clara.classify_document(p_document uuid, p_kind text, p_confidence numeric, p_engine_id text, p_op_key text, p_task uuid, p_run text, p_claim_secret text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'clara', 'pg_temp'
 as $$
declare
  d record; t record; v_dedupe jsonb; v_ext uuid; v_version int; v_prior text;
  f record; v_q uuid; v_questions jsonb:='[]'::jsonb; v_set boolean:=false;
  v_human boolean:=false;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  -- ADV-R4#6: the document row is LOCKED for the whole verdict write — the two
  -- classification writers serialize instead of racing on the kind.
  select * into d from clara.documents where id=p_document for update;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  if p_engine_id is null or p_engine_id not like 'clara-classify-%' then
    raise exception 'classifier engine must carry the clara-classify- prefix' using errcode='CLR10';
  end if;
  -- ADV-R5: the human attestation engine ID is RESERVED for set_document_kind —
  -- a classifier caller may never mint a human-looking verdict row.
  if p_engine_id='clara-classify-human:v1' then
    raise exception 'the human attestation engine id is reserved for set_document_kind'
      using errcode='CLR10',detail='{"reason":"reserved_engine"}';
  end if;
  if p_confidence is null or p_confidence<0 or p_confidence>1 then
    raise exception 'classifier confidence is malformed' using errcode='CLR10';
  end if;
  -- F-A7 gamma (AB-5/D-9): identity_document joins the settleable kind vocabulary here --
  -- present on all three DB surfaces (this list, set_document_kind's list,
  -- documents_document_kind_check) and NOT a DB_REFUSED_KINDS member (runtime, PR-rho's):
  -- the refusal is B8's and the firm-narrow output wall's, not a prompt instruction.
  if p_kind is null or p_kind not in
     ('invoice','receipt','credit_note','debit_note','bank_statement','payment_voucher',
      'claim_form','payroll_summary','tax_correspondence','ssm_company_doc',
      'agreement_contract','e_invoice_xml','management_account','opening_balance_doc',
      'knowledge_artifact','handwritten_note','consent_evidence','prior_gl','other',
      'identity_document') then
    raise exception 'unsupported document kind %',p_kind using errcode='CLR10';
  end if;
  -- 0014: consent evidence is a legal artifact owned by the egress-consent path;
  -- the classifier may neither assign nor overwrite it.
  if d.document_kind='consent_evidence' or p_kind='consent_evidence' then
    raise exception 'consent-evidence classification is owned by the egress consent path'
      using errcode='CLR28';
  end if;
  -- 0038 (design 4.2 / part2 section 5): the machine half of the same law. A classifier
  -- verdict that DIFFERS from the kind a live bank statement was ingested under is refused
  -- here rather than allowed to land -- and it is refused at the top, before the verdict row
  -- and before the op-key reservation, because the remedy is not "try again with more
  -- confidence", it is "void the statement first". Note the refusal is deliberately on the
  -- PROPOSED kind, not on whether this particular call would have written it: a low-confidence
  -- differing verdict on a live-statement document is a classification the firm must resolve
  -- against the statement, not an open question to file quietly. A same-kind verdict -- the
  -- ordinary idempotent re-run -- passes untouched.
  if p_kind is distinct from d.document_kind
     and clara._bank_live_statement_on_document(p_document) then
    raise exception 'a live bank statement is bound to this document; void it before re-classifying'
      using errcode='CLR10',detail='{"reason":"live_bank_statement_present"}';
  end if;
  -- P3: the request hash is SHAPE-CONDITIONAL — the null-task path hashes with the
  -- EXACT pre-0024 4-key shape so a historical op_key still replays byte-identically;
  -- only a task-bound call's hash gains the task+run identity (so reusing an op_key
  -- under a DIFFERENT task/run is an honest CLR10, not a silently-ignored argument).
  v_dedupe:=clara._reserve_op(d.firm_id,'classify_document',p_op_key,
    case when p_task is null then
      clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,
        'confidence',p_confidence,'engine',p_engine_id))
    else
      clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,
        'confidence',p_confidence,'engine',p_engine_id,'task',p_task,'run',p_run))
    end);
  if v_dedupe is not null then return v_dedupe; end if;

  if p_task is not null then
    -- P2: TASK- AND RUN-BOUND — id/document/lane/engine locate a candidate row, and
    -- t.workflow_run_id must match the identity the caller's OWN claim wrote to it
    -- (claim_document_processing_task, 0009:2229-2231). Q1: run-token identity alone is
    -- NOT authorization — clara_runtime holds table-wide SELECT on this table (0008), so
    -- workflow_run_id is readable by any session, not just the claimant. The settle
    -- additionally requires sha256(p_claim_secret) = t.claim_secret_digest — the digest of
    -- the CAPABILITY claim_document_processing_task minted and returned ONLY to the
    -- claiming session at claim time, never stored anywhere in preimage form. A caller
    -- that read the run id off the table cannot reconstruct this.
    select * into t from clara.document_processing_tasks
      where id=p_task and document_id=p_document and lane='classify' and engine_id=p_engine_id
      for update;
    if not found then
      raise exception 'classify task not found for this document/engine' using errcode='CLR16';
    end if;
    if t.status='running' and t.workflow_run_id=p_run
       and t.claim_secret_digest=sha256(convert_to(coalesce(p_claim_secret,''),'UTF8')) then
      update clara.document_processing_tasks set status='done',finished_at=now()
        where id=t.id;
    else
      raise exception 'this classify task is not running under the caller''s own claim — it already settled, a newer attempt exists, the run token does not match, or the claim secret is wrong'
        using errcode='CLR16';
    end if;
  else
    -- P1: NO-TASK CEREMONY (WA21-R11) — its REAL precondition, DB-enforced: the document
    -- must carry NO classify-task history AT ALL (any status, any engine, any version).
    -- A document with ANY task history must go through the task-bound path above; there
    -- is nothing left for this path to settle, so it proceeds straight to the verdict.
    if exists(select 1 from clara.document_processing_tasks
        where document_id=p_document and lane='classify') then
      raise exception 'classify task history exists for this document — the no-task ceremony requires a task-free document'
        using errcode='CLR16';
    end if;
  end if;

  -- the verdict row: engine_kind='doc_classify', NO regions (the verdict rides
  -- the envelope — nothing here can ever collide with an attribution pattern).
  -- 0026 P1 (O-round finding): scoped to engine_kind='doc_classify' — post-widening, a
  -- legal structured_parse extraction can coexist under THIS SAME engine_id (nothing
  -- prevents an intake task from reusing a clara-classify-* engine string), and an
  -- engine_id-only mint would count it, minting v2 for a verdict whose own per-lane task
  -- sits at v1 — breaking task/extraction version correspondence.
  select coalesce(max(version_n),0)+1 into v_version from clara.document_extractions
    where document_id=p_document and engine_id=p_engine_id and engine_kind='doc_classify';
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(d.firm_id,p_document,p_engine_id,'doc_classify',v_version,'done',
      coalesce(d.page_count,0),
      jsonb_build_object('verdict_kind',p_kind,'confidence',p_confidence,
        'low_confidence',p_confidence<0.8,'source','classifier'))
    returning id into v_ext;

  v_prior:=d.document_kind;
  -- ADV-R4#6 / ADV-R5: a HUMAN verdict (set_document_kind) is never overwritten
  -- by the classifier — the classifier's verdict ROW persists above, but the
  -- kind and the classified event stay with the human correction. Precedence is
  -- detected by the row's SOURCE MARKER (envelope source='human', written only
  -- by set_document_kind), never by an engine-id string a caller could supply.
  v_human:=exists(select 1 from clara.document_extractions hx
    where hx.document_id=p_document and hx.engine_kind='doc_classify'
      and hx.status='done' and hx.envelope->>'source'='human');
  if p_confidence>=0.8 and not v_human then
    update clara.documents set document_kind=p_kind where id=p_document;
    v_set:=true;
    -- 0040 (C-c, WCC-R8 ride-along; register entry 9's other half): RE-KIND TASK RETIREMENT --
    -- the machine twin of set_document_kind's. It lives INSIDE this branch on purpose: a
    -- low-confidence verdict writes no kind (it opens a question instead) and a verdict beaten
    -- by human precedence writes no kind either, and neither may retire anybody's queued work.
    -- Same narrow scope: queued only, kind-bound lanes only, never 'classify', no re-enqueue.
    update clara.document_processing_tasks
      set status='failed', error_code='skipped_kind', finished_at=now()
      where document_id=p_document and status='queued'
        and ((lane in ('invoice_facts','llm_witness')
              and p_kind not in ('invoice','credit_note','debit_note','receipt'))
          or (lane in ('statement_facts','statement_parse') and p_kind<>'bank_statement'));
    perform clara._audit(d.firm_id,null,null,null,'classify_document',null,
      jsonb_build_object('document',p_document,'kind',p_kind,'confidence',p_confidence,
        'engine',p_engine_id,'prior_kind',v_prior,'extraction',v_ext,'op_key',p_op_key));
    perform clara._append_event(d.firm_id,'document.classified',null,null,null,null,
      null,p_document,null,
      jsonb_build_object('document_kind',p_kind,'confidence',p_confidence,
        'engine_id',p_engine_id,'extraction_id',v_ext,'prior_kind',v_prior,
        'source','classifier'));
  elsif v_human then
    -- human precedence: the verdict ROW persisted above; the kind, the
    -- classified event, and the review lane all stay with the human correction.
    perform clara._audit(d.firm_id,null,null,null,'classify_document',null,
      jsonb_build_object('document',p_document,'kind',p_kind,'confidence',p_confidence,
        'engine',p_engine_id,'prior_kind',v_prior,'extraction',v_ext,
        'human_precedence',true,'op_key',p_op_key));
  else
    for f in select df.client_id,df.id as filing_id from clara.document_filings df
        join clara.clients oc on oc.id=df.client_id and oc.status='active'
        where df.document_id=p_document and df.retired_at is null loop
      if not exists(select 1 from clara.open_questions q
          where q.client_id=f.client_id and q.document_id=p_document
            and q.origin='classification' and q.status='open') then
        insert into clara.open_questions(firm_id,client_id,scope_kind,scope_id,document_id,
            origin,question_text,status,opener_kind,opened_by)
          values(d.firm_id,f.client_id,'document',p_document,p_document,'classification',
            'What kind of document is this? The classifier was not confident ('
              ||round(p_confidence*100)::text||'%; best guess: '||p_kind||').',
            'open','wake',null)
          returning id into v_q;
        v_questions:=v_questions||to_jsonb(v_q);
        perform clara._append_event(d.firm_id,'open_question.opened',f.client_id,null,null,null,
          null,p_document,null,
          jsonb_build_object('question_id',v_q,'origin','classification'));
      end if;
    end loop;
    perform clara._audit(d.firm_id,null,null,null,'classify_document',null,
      jsonb_build_object('document',p_document,'kind',p_kind,'confidence',p_confidence,
        'engine',p_engine_id,'prior_kind',v_prior,'extraction',v_ext,
        'low_confidence',true,'questions',v_questions,'op_key',p_op_key));
  end if;
  return clara._finish_op(d.firm_id,'classify_document',p_op_key,
    jsonb_build_object('document_id',p_document,'extraction_id',v_ext,
      'document_kind',case when v_set then p_kind else v_prior end,
      'kind_set',v_set,'confidence',p_confidence,'questions',v_questions));
end $$;
alter function clara.classify_document(uuid,text,numeric,text,text,uuid,text,text) owner to clara_fn_owner;
grant execute on function clara.classify_document(uuid,text,numeric,text,text,uuid,text,text) to clara_runtime;

create or replace function clara.set_document_kind(p_document uuid, p_kind text, p_reason text, p_op_key text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'clara', 'pg_temp'
 as $$
declare c record; wk record; d record; v_dedupe jsonb; v_ext uuid; v_version int; v_prior text;
begin
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot set a document kind' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_document is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'a document and a reason are required' using errcode='CLR10';
  end if;
  -- F-A7 gamma (AB-5/D-9): identity_document joins the settleable kind vocabulary here too --
  -- same list as classify_document's, same reasoning.
  if p_kind is null or p_kind not in
     ('invoice','receipt','credit_note','debit_note','bank_statement','payment_voucher',
      'claim_form','payroll_summary','tax_correspondence','ssm_company_doc',
      'agreement_contract','e_invoice_xml','management_account','opening_balance_doc',
      'knowledge_artifact','handwritten_note','consent_evidence','prior_gl','other',
      'identity_document') then
    raise exception 'unsupported document kind %',p_kind using errcode='CLR10';
  end if;
  -- ADV-R4#6: locked — serialized against the classifier writer.
  select * into d from clara.documents where id=p_document for update;
  if not found or d.firm_id<>c.firm then
    raise exception 'document not in your firm' using errcode='CLR11';
  end if;
  if d.document_kind='consent_evidence' or p_kind='consent_evidence' then
    raise exception 'consent-evidence classification is owned by the egress consent path'
      using errcode='CLR28';
  end if;
  -- 0038 (design 4.2 / part2 section 5): A LIVE BANK STATEMENT PINS THE DOCUMENT KIND. The
  -- kind is what routed this document to the statement lane; changing it under a live
  -- statement leaves that statement, its lines and every match on them citing a document the
  -- schema now calls something else. Same family as the filing refusals in
  -- approve_wrong_client_correction and retire_document_filing, same remedy: void the
  -- statement first (which itself requires zero pending/live match groups on its lines,
  -- WCB-R5), then re-classify, then re-ingest. A SAME-KIND write is untouched.
  if p_kind is distinct from d.document_kind
     and clara._bank_live_statement_on_document(p_document) then
    raise exception 'a live bank statement is bound to this document; void it before re-classifying'
      using errcode='CLR10',detail='{"reason":"live_bank_statement_present"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'set_document_kind',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_prior:=d.document_kind;
  update clara.documents set document_kind=p_kind where id=p_document;
  -- 0040 (C-c, WCC-R8 ride-along; register entry 9's other half): RE-KIND TASK RETIREMENT.
  -- The lane a document sits in was chosen from the kind it carried at enqueue. Now that the
  -- kind has changed, a QUEUED task in a kind-bound lane is not merely wasted work -- it is a
  -- BLOCKER: the router's in-flight short-circuit returns that stale task instead of enqueuing
  -- the correct lane, so a mis-classified document that a human corrects never reaches the
  -- lane it belongs in. Retired here, in the same transaction as the flip, with the receipt on
  -- the task trail (the `skipped_kind` idiom the router already uses for "nowhere to go").
  --
  -- THE SCOPE IS AS NARROW AS THE INTENT: only QUEUED tasks (the transition trigger admits
  -- nothing else), only lanes whose kind set NO LONGER admits the new kind, and never the
  -- kind-independent 'classify' lane. A receipt re-kinded to invoice keeps its invoice_facts
  -- task untouched. NO RE-ENQUEUE happens here: minting work is the router's authority, not a
  -- classification verb's -- retiring the blocker is what lets the ordinary enqueue path do
  -- its job on the next fire.
  update clara.document_processing_tasks
    set status='failed', error_code='skipped_kind', finished_at=now()
    where document_id=p_document and status='queued'
      and ((lane in ('invoice_facts','llm_witness')
            and p_kind not in ('invoice','credit_note','debit_note','receipt'))
        or (lane in ('statement_facts','statement_parse') and p_kind<>'bank_statement'));
  -- 0026 P1 (O-round finding): scoped to engine_kind='doc_classify' — same reasoning as
  -- classify_document's own mint, applied to the human-attestation writer's dedicated
  -- engine_id.
  select coalesce(max(version_n),0)+1 into v_version from clara.document_extractions
    where document_id=p_document and engine_id='clara-classify-human:v1' and engine_kind='doc_classify';
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(c.firm,p_document,'clara-classify-human:v1','doc_classify',v_version,'done',
      coalesce(d.page_count,0),
      jsonb_build_object('verdict_kind',p_kind,'confidence',1,
        'source','human','actor',c.actor,'reason',btrim(p_reason)))
    returning id into v_ext;
  perform clara._audit(c.firm,c.actor,null,null,'set_document_kind',null,
    jsonb_build_object('document',p_document,'kind',p_kind,'prior_kind',v_prior,
      'reason',p_reason,'extraction',v_ext,'op_key',p_op_key));
  perform clara._append_event(c.firm,'document.classified',null,c.actor,null,null,
    null,p_document,null,
    jsonb_build_object('document_kind',p_kind,'prior_kind',v_prior,
      'extraction_id',v_ext,'source','human'));
  return clara._finish_op(c.firm,'set_document_kind',p_op_key,
    jsonb_build_object('document_id',p_document,'document_kind',p_kind,
      'prior_kind',v_prior,'extraction_id',v_ext));
end $$;
alter function clara.set_document_kind(uuid,text,text,text) owner to clara_fn_owner;

-- =====================================================================================
-- SECTION 9 -- documents_document_kind_check + ck_processing_task_error_code_f_a1: widened.
-- =====================================================================================
alter table clara.documents drop constraint documents_document_kind_check;
alter table clara.documents add constraint documents_document_kind_check
  check (document_kind is null or document_kind = any (array[
    'invoice','receipt','credit_note','debit_note','bank_statement','payment_voucher',
    'claim_form','payroll_summary','tax_correspondence','ssm_company_doc',
    'agreement_contract','e_invoice_xml','management_account','opening_balance_doc',
    'knowledge_artifact','handwritten_note','consent_evidence','prior_gl','other',
    'identity_document']));

alter table clara.document_processing_tasks drop constraint ck_processing_task_error_code_f_a1;
alter table clara.document_processing_tasks add constraint ck_processing_task_error_code_f_a1
  check (error_code is null or error_code = any (array[
    'engine_error','timeout','engine_lost','storage_error','corrupt','encrypted','bad_type',
    'limit','budget','attempt_cap','internal','skipped_kind','header_unreadable',
    'totals_unreadable','readers_disagree','chain_broken','continuity_mismatch',
    'duplicate_period','overlapping_period','non_myr_statement','account_unregistered',
    'account_inactive','statement_multi_client','period_invalid','line_date_out_of_period',
    'consent_inactive','witness_multi_client','witness_consent_inactive','wait_exhausted',
    'document_processing_multi_client','document_processing_consent_inactive',
    'firm_narrow_consent_inactive']));

-- ck_processing_task_binding_f_a1 is a SEPARATE, narrower CHECK: it names the exact closed set
-- of error codes admitted on a TERMINAL-FAILED, NEVER-CLAIMED row (workflow_run_id IS NULL and
-- started_at IS NULL) -- the exact shape the classify gate's terminal receipts use. MEASURED
-- (rig replay caught this): the plain error_code vocabulary CHECK above does NOT cover this
-- narrower binding CHECK, and the three new classify-gate codes were refused by it in the
-- battery before this widening. Extend-only, same discipline as every other CHECK in this file.
do $s9b_pre$
declare v_def text;
begin
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='document_processing_tasks' and con.contype='c'
     and con.conname='ck_processing_task_binding_f_a1';
  if v_def <> 'CHECK ((((status = ANY (ARRAY[''queued''::text, ''held_egress''::text])) AND (workflow_run_id IS NULL) AND (started_at IS NULL)) OR ((status = ANY (ARRAY[''running''::text, ''done''::text])) AND (workflow_run_id IS NOT NULL) AND (started_at IS NOT NULL)) OR ((status = ''failed''::text) AND (((workflow_run_id IS NOT NULL) AND (started_at IS NOT NULL)) OR ((workflow_run_id IS NULL) AND (started_at IS NULL) AND (error_code = ANY (ARRAY[''budget''::text, ''attempt_cap''::text, ''skipped_kind''::text, ''consent_inactive''::text, ''statement_multi_client''::text, ''witness_multi_client''::text, ''witness_consent_inactive''::text])))))))' then
    raise exception 'f_a7_gamma_egress S9b prestate: ck_processing_task_binding_f_a1 is not the expected pre-widening form (got %)', v_def using errcode='CLR10';
  end if;
end
$s9b_pre$;
alter table clara.document_processing_tasks drop constraint ck_processing_task_binding_f_a1;
alter table clara.document_processing_tasks add constraint ck_processing_task_binding_f_a1
  check (
    (status in ('queued','held_egress') and workflow_run_id is null and started_at is null)
    or (status in ('running','done') and workflow_run_id is not null and started_at is not null)
    or (status = 'failed' and (
      (workflow_run_id is not null and started_at is not null)
      or (workflow_run_id is null and started_at is null and error_code = any (array[
        'budget','attempt_cap','skipped_kind','consent_inactive','statement_multi_client',
        'witness_multi_client','witness_consent_inactive',
        'document_processing_multi_client','document_processing_consent_inactive',
        'firm_narrow_consent_inactive'])))));

-- =====================================================================================
-- SECTION 10 -- register the FOUR new event types this file emits, and cover them at the
-- ACTIVE taxonomy version by ADDITIVE INSERT, decision 'ignore'. MEASURED, TWICE, at THIS
-- lane's own rig replay:
--   (1) 'document.classify_failed' is NOT new -- 0024_fail_classify.sql already registered it
--       ('Document classification failed honestly', client_scoped=true) and it is ALREADY
--       covered at the active taxonomy version, decision=ignore. This file's classify-gate
--       emit REUSES that existing, semantically-apt event type; registering it again is a
--       duplicate-key error (caught at rig replay before this shipped).
--   (2) trigger_taxonomy / taxonomy_versions are APPEND-ONLY tables, NOT closed-per-version
--       snapshots -- INSERT into the row set of the CURRENT active version is the estate's own
--       tested and pinned discipline (wave-a-shape.test.mjs "SS3 additive-insert into the ACTIVE
--       taxonomy version -- NO version flip", probe P7). The first draft of this section wrongly
--       modeled taxonomy versioning on chatTurn's frozen-_vN pattern and MINTED a new version +
--       repointed taxonomy_active -- caught by that exact estate test (803) failing "active
--       version 3 !== 2 (NO flip)" on the full-estate run. A version FLIP is reserved for
--       something this file does not do; extending the live one is the correct and only shape.
-- All four new types are firm-scoped with no client dimension at all -- client_scoped=false,
-- honest about the shape (this file's verbs never pass a client_id for them, and never could).
-- =====================================================================================
do $s10$
declare v_active int; v_n int;
begin
  if not exists (select 1 from clara.event_types where name = 'document.classify_failed') then
    raise exception 'f_a7_gamma_egress S10 prestate: document.classify_failed is not already registered -- the assumption this section is built on is false' using errcode='CLR10';
  end if;

  select version into v_active from clara.taxonomy_active where singleton;
  if v_active is null then
    raise exception 'f_a7_gamma_egress S10: no active taxonomy version found' using errcode='CLR10';
  end if;

  insert into clara.event_types(name, client_scoped, description) values
    ('egress.firm_purpose_consent_granted', false, 'F-A7 gamma: firm-narrow typed egress consent granted (firm_narrow_intake, per moment)'),
    ('egress.firm_purpose_activated', false, 'F-A7 gamma: firm-narrow typed egress activation (firm_narrow_intake, per moment)'),
    ('egress.firm_purpose_deactivated', false, 'F-A7 gamma: firm-narrow typed egress deactivation (firm_narrow_intake, per moment)'),
    ('egress.firm_purpose_consent_revoked', false, 'F-A7 gamma: firm-narrow typed egress consent revoked (firm_narrow_intake, per moment)');

  insert into clara.trigger_taxonomy(version, event_type, decision, note) values
    (v_active, 'egress.firm_purpose_consent_granted', 'ignore', null),
    (v_active, 'egress.firm_purpose_activated', 'ignore', null),
    (v_active, 'egress.firm_purpose_deactivated', 'ignore', null),
    (v_active, 'egress.firm_purpose_consent_revoked', 'ignore', null);

  select count(*)::int into v_n from clara.trigger_taxonomy where version = v_active;
  raise notice 'f_a7_gamma_egress S10: additive-insert at the ACTIVE taxonomy version % — NO flip; event_types gained 4 rows (document.classify_failed reused, already registered by 0024); trigger_taxonomy at version % now carries % rows', v_active, v_active, v_n;
end
$s10$;

-- =====================================================================================
-- TAIL -- POSTCHECK.
-- =====================================================================================
do $post$
declare v_src text; v_sha text; v_def text; v_n int; v_sig text; v_acl text; v_was text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara.grant_client_egress_purpose(uuid,text,uuid,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'bc270350435aa78fd194a4985feca93f18af06f00a1ccb10bbf2e80f74074479' then
    raise exception 'f_a7_gamma_egress postcheck: grant_client_egress_purpose prosrc sha256 mismatch (got %, expected the value measured on THIS lane''s own rig replay after the recut)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.activate_client_egress_purpose(uuid,text,uuid,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '653a9d35072989da1ea3641c41e9f3ee32f28bff9175440d619af5bc0df89e83' then
    raise exception 'f_a7_gamma_egress postcheck: activate_client_egress_purpose prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.deactivate_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '071c2e4338465cfd1a72450f242a9169278ef95817f16b530e278335f3d2d65b' then
    raise exception 'f_a7_gamma_egress postcheck: deactivate_client_egress_purpose prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.revoke_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'c3054920ee409b4ebdb31071ad4593173dd0b3b5aa73c5a231e28ad220a8bd32' then
    raise exception 'f_a7_gamma_egress postcheck: revoke_client_egress_purpose prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'd41c649b23d1e624cb77a6981e4d1e29e14ee7a800d27ed2f3a4cf002276a500' then
    raise exception 'f_a7_gamma_egress postcheck: prepare_egress_dispatch prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'dbd002d63912b101506b8091baa618b309cc997b472cbc009eb59a80cc2b44f4' then
    raise exception 'f_a7_gamma_egress postcheck: _enqueue_invoice_facts_core prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'd6a63f240a162f999a1b3f9c04f462945e9f3a73b0691d6c76d8f35aaed217dd' then
    raise exception 'f_a7_gamma_egress postcheck: persist_document_extraction prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '572806fa57b31c5420a2fb9fb21e0c8c03947f8af7f2ce2a6637a7952e6ba88c' then
    raise exception 'f_a7_gamma_egress postcheck: classify_document prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.set_document_kind(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '611bc5433a9dc6ebd5d18c95e13cb58b5546a8d8c4bb29ceabfcbc278f3da3f7' then
    raise exception 'f_a7_gamma_egress postcheck: set_document_kind prosrc sha256 mismatch (got %)', v_sha using errcode='CLR10';
  end if;

  -- Non-regression: claim_document_processing_task is STILL byte-unmoved and edge-free.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '01e517bf575806a01f93441bbc2459856e1f4f12624b312c3ba670ebf111b9a0' then
    raise exception 'f_a7_gamma_egress postcheck: claim_document_processing_task prosrc sha256 CHANGED (got %) -- this file must never touch this body', v_sha using errcode='CLR10';
  end if;
  if v_src ilike '%client_egress_purpose%' or v_src ilike '%prepare_egress_dispatch%' or v_src ilike '%consume_egress_dispatch%' or v_src ilike '%firm_egress_purpose%' or v_src ilike '%prepare_firm_egress_dispatch%' then
    raise exception 'f_a7_gamma_egress postcheck: claim_document_processing_task now carries a typed-consent call edge -- AB-4''s wall is broken' using errcode='CLR10';
  end if;

  -- The five widened CHECKs, re-read and asserted at their widened form.
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='client_egress_purpose_consents' and con.contype='c'
     and con.conname='ck_client_egress_purpose_consents_purpose_f_a1';
  if v_def <> 'CHECK ((purpose = ANY (ARRAY[''wiki_synthesis''::text, ''statement_extraction''::text, ''witness_extraction''::text, ''bank_matching''::text, ''document_processing''::text])))' then
    raise exception 'f_a7_gamma_egress postcheck: client_egress_purpose_consents purpose CHECK is not the expected 5-value form (got %)', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='client_egress_purpose_activations' and con.contype='c'
     and con.conname='ck_client_egress_purpose_activations_purpose_f_a1';
  if v_def <> 'CHECK ((purpose = ANY (ARRAY[''wiki_synthesis''::text, ''statement_extraction''::text, ''witness_extraction''::text, ''bank_matching''::text, ''document_processing''::text])))' then
    raise exception 'f_a7_gamma_egress postcheck: client_egress_purpose_activations purpose CHECK is not the expected 5-value form (got %)', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='egress_dispatch_authorizations' and con.contype='c'
     and con.conname='ck_egress_dispatch_authorizations_purpose_f_a1';
  if v_def <> 'CHECK ((purpose = ANY (ARRAY[''wiki_synthesis''::text, ''statement_extraction''::text, ''witness_extraction''::text, ''bank_matching''::text, ''document_processing''::text])))' then
    raise exception 'f_a7_gamma_egress postcheck: egress_dispatch_authorizations purpose CHECK is not the expected 5-value form (got %)', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='egress_dispatch_authorizations' and con.contype='c'
     and con.conname='ck_egress_dispatch_authorizations_doc_sha';
  if v_def <> 'CHECK ((((purpose <> ''wiki_synthesis''::text) OR (document_sha256 IS NULL)) AND ((purpose <> ''statement_extraction''::text) OR (document_sha256 IS NOT NULL)) AND ((purpose <> ''witness_extraction''::text) OR (document_sha256 IS NOT NULL)) AND ((purpose <> ''bank_matching''::text) OR (document_sha256 IS NULL)) AND ((purpose <> ''document_processing''::text) OR (document_sha256 IS NOT NULL))))' then
    raise exception 'f_a7_gamma_egress postcheck: ck_egress_dispatch_authorizations_doc_sha is not the expected widened form (got %)', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='documents' and con.contype='c' and con.conname='documents_document_kind_check';
  if v_def <> 'CHECK (((document_kind IS NULL) OR (document_kind = ANY (ARRAY[''invoice''::text, ''receipt''::text, ''credit_note''::text, ''debit_note''::text, ''bank_statement''::text, ''payment_voucher''::text, ''claim_form''::text, ''payroll_summary''::text, ''tax_correspondence''::text, ''ssm_company_doc''::text, ''agreement_contract''::text, ''e_invoice_xml''::text, ''management_account''::text, ''opening_balance_doc''::text, ''knowledge_artifact''::text, ''handwritten_note''::text, ''consent_evidence''::text, ''prior_gl''::text, ''other''::text, ''identity_document''::text]))))' then
    raise exception 'f_a7_gamma_egress postcheck: documents_document_kind_check is not the expected 20-value form (got %)', v_def using errcode='CLR10';
  end if;

  -- Kind vocabulary present on both bodies.
  if position('identity_document' in (select p.prosrc from pg_proc p where p.oid='clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)'::regprocedure)) = 0 then
    raise exception 'f_a7_gamma_egress postcheck: classify_document does not name identity_document' using errcode='CLR10';
  end if;
  if position('identity_document' in (select p.prosrc from pg_proc p where p.oid='clara.set_document_kind(uuid,text,text,text)'::regprocedure)) = 0 then
    raise exception 'f_a7_gamma_egress postcheck: set_document_kind does not name identity_document' using errcode='CLR10';
  end if;

  -- ck_processing_task_binding_f_a1 widened: the three new gate codes are admitted on a
  -- terminal-failed, never-claimed row.
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='document_processing_tasks' and con.contype='c'
     and con.conname='ck_processing_task_binding_f_a1';
  if v_def !~ 'document_processing_consent_inactive' or v_def !~ 'firm_narrow_consent_inactive' then
    raise exception 'f_a7_gamma_egress postcheck: ck_processing_task_binding_f_a1 does not admit the new gate codes (got %)', v_def using errcode='CLR10';
  end if;

  -- The four NEW firm-narrow event types are registered; document.classify_failed is REUSED
  -- (0024's own row, unchanged by this file — asserted absent from a fresh insert by S10's own
  -- prestate raise, so a duplicate here would already have aborted the apply).
  select count(*)::int into v_n from clara.event_types where name in
    ('egress.firm_purpose_consent_granted','egress.firm_purpose_activated',
     'egress.firm_purpose_deactivated','egress.firm_purpose_consent_revoked');
  if v_n <> 4 then
    raise exception 'f_a7_gamma_egress postcheck: expected 4 new event_types rows (got %)', v_n using errcode='CLR10';
  end if;
  -- All FIVE event types this file's bodies emit (4 new + the reused document.classify_failed)
  -- are covered at the ACTIVE taxonomy version, decision=ignore.
  select count(*)::int into v_n from clara.trigger_taxonomy tt
    join clara.taxonomy_active ta on ta.version = tt.version
   where tt.event_type in
    ('egress.firm_purpose_consent_granted','egress.firm_purpose_activated',
     'egress.firm_purpose_deactivated','egress.firm_purpose_consent_revoked',
     'document.classify_failed') and tt.decision = 'ignore';
  if v_n <> 5 then
    raise exception 'f_a7_gamma_egress postcheck: expected 5 rows covering the 5 emitted event types at the ACTIVE taxonomy version, decision=ignore (got %)', v_n using errcode='CLR10';
  end if;

  -- engine_kind CHECK byte-unmoved (design: a SUBSET read, never a widened CHECK).
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='document_extractions' and con.contype='c'
     and con.conname='ck_document_extractions_engine_kind_f_a1';
  if v_def <> 'CHECK ((engine_kind = ANY (ARRAY[''ocr''::text, ''structured_parse''::text, ''invoice_facts''::text, ''doc_classify''::text, ''statement_facts''::text, ''llm_text_facts''::text, ''llm_vision_facts''::text])))' then
    raise exception 'f_a7_gamma_egress postcheck: ck_document_extractions_engine_kind_f_a1 changed unexpectedly (got %) -- this file must never widen it', v_def using errcode='CLR10';
  end if;

  -- THE ACL MATRIX ON THE NINE CoR'D BODIES IS UNMOVED (measured against SECTION 0).
  select count(*)::int into v_n from _fa7gamma_pre_acl;
  if v_n <> 9 then
    raise exception 'f_a7_gamma_egress postcheck: the pre-recut ACL capture holds % rows (expected 9)', v_n using errcode='CLR10';
  end if;
  for v_sig, v_was in select sig, acl from _fa7gamma_pre_acl order by sig loop
    select coalesce(
      (select string_agg(a.grantee::regrole::text||':'||a.privilege_type, ',' order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
         from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = v_sig::regprocedure), '(none)') into v_acl;
    if v_acl is distinct from v_was then
      raise exception 'f_a7_gamma_egress postcheck: % changed ACL across the recut (was [%], now [%])', v_sig, v_was, v_acl using errcode='CLR10';
    end if;
  end loop;

  -- The five new firm-narrow functions carry NO PUBLIC EXECUTE (the leak this file's own
  -- authoring caught and fixed).
  for v_sig in select unnest(array[
    'clara.grant_firm_egress_purpose(text,text,uuid,text,text)',
    'clara.activate_firm_egress_purpose(text,text,uuid,text)',
    'clara.deactivate_firm_egress_purpose(text,text,text,text)',
    'clara.revoke_firm_egress_purpose(text,text,text,text)',
    'clara.prepare_firm_egress_dispatch(uuid,text,text,bigint,text,text)'])
  loop
    if has_function_privilege('public', v_sig::regprocedure, 'execute') then
      raise exception 'f_a7_gamma_egress postcheck: PUBLIC has EXECUTE on % — the leak this file must not ship', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- New objects present with the right shape.
  if not exists(select 1 from information_schema.tables where table_schema='clara' and table_name='firm_egress_purpose_consents') then
    raise exception 'f_a7_gamma_egress postcheck: firm_egress_purpose_consents was not created' using errcode='CLR10';
  end if;
  if not exists(select 1 from information_schema.tables where table_schema='clara' and table_name='firm_egress_purpose_activations') then
    raise exception 'f_a7_gamma_egress postcheck: firm_egress_purpose_activations was not created' using errcode='CLR10';
  end if;
  if not exists(select 1 from information_schema.tables where table_schema='clara' and table_name='firm_egress_dispatch_authorizations') then
    raise exception 'f_a7_gamma_egress postcheck: firm_egress_dispatch_authorizations was not created' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname in ('firm_egress_purpose_consents','firm_egress_purpose_activations','firm_egress_dispatch_authorizations')
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 3 then
    raise exception 'f_a7_gamma_egress postcheck: expected all three firm_egress_* tables to carry FORCE ROW LEVEL SECURITY (got %)', v_n using errcode='CLR10';
  end if;

  raise notice 'f_a7_gamma_egress tail: OK -- 5th purpose document_processing (client-scoped, document-tied) live on all 4 purpose-bearing CHECKs + the doc-sha CHECK''s own conjunct; the 4 client-purpose verbs + prepare_egress_dispatch recut, ACLs unmoved; the firm-narrow 3-relation family (firm_narrow_intake, moments attribution/onboarding_interview) live with 4 verbs + prepare_firm_egress_dispatch, owner-only RLS mirroring 0020''s own shape; the classify consent gate lands in _enqueue_invoice_facts_core AT ENQUEUE (filed->client document_processing, unfiled->firm-narrow attribution), never in claim_document_processing_task (confirmed byte-unmoved and edge-free, both directions); persist_document_extraction carries the firm-narrow output wall (INERT under every caller reachable today -- v_ekind can only be ocr/structured_parse given the existing lane guard, wired ahead of its router per 0090''s own llm_witness precedent, stated honestly rather than claimed forceable); identity_document is a settleable kind on documents_document_kind_check + classify_document + set_document_kind (NOT in any refusal list); ck_processing_task_error_code_f_a1 widened for 3 new gate codes; ck_document_extractions_engine_kind_f_a1 byte-unmoved. D1 write-quiesce taken (the 9 CoR''d bodies). No table in workflow/graphile_worker/spike touched. CLASSIFY_KINDS (packages/runtime/lib/classify-llm.mjs) is NOT updated by this file -- that is PR-rho''s (annexes-2 SSI.1 train rho, runtime).';
end
$post$;
