-- ============================================================================
-- NOT A DELIVERABLE. NOT A MIGRATION. NEVER MERGE THIS FILE INTO A RELEASE.
-- ============================================================================
--
-- This file is a LOCAL RIG SCAFFOLD for the F-A1 PR-1 *predicate* lane only. It lives
-- OUTSIDE `packages/db/migrations/` on purpose: the migration runner globs that directory
-- (`^\d+.*\.sql$`), the evaluator freeze-lint scans it, and the CI deploy-onto-existing check
-- swaps it wholesale from origin/main. A file here is invisible to all three, which is exactly
-- the property this scaffold needs.
--
-- WHY IT EXISTS. The witness engine_kinds (`llm_text_facts` / `llm_vision_facts`), the
-- `llm_witness` lane and the `llm-%` engine prefix arm are the WALLS lane's PR-1 deliverable
-- (design §3.2, Annex A walls 1-3). The predicate lane needs those three CHECKs widened only
-- so it can INSERT witness rows into a throwaway and exercise
-- `clara.evaluate_witness_fact_state_v1` + the two dispatch recuts. PR-1 will carry the WALLS
-- LANE's version of this widening — with its own prestate, its own refusal cells and its own
-- review. This file is deliberately the crudest possible thing that unblocks a rig; it has no
-- prestate, no tail census, no refusal-code widening, no claim-body/release list edits, no
-- typed-purpose surface. Using it as the basis for the real widening would ship every one of
-- those omissions.
--
-- HOW IT IS APPLIED: by hand, ONCE, to a throwaway database AFTER the full 0001..NNNN baseline
-- and BEFORE `packages/db/migrations/UNNUMBERED_f_a1_predicate.sql`. It writes no
-- clara.schema_migrations row, so the runner neither knows nor cares that it ran.
--
--   psql "$DSN" -f packages/db/migrations-scaffold/ZZ_rig_only_kind_widening.sql
--
-- SAFETY: it refuses outright unless the target database name looks disposable, so a
-- copy-paste into a real project shell dies before it drops a constraint.

do $rig_only_guard$
begin
  if current_database() !~ '(_ci|_test|_tmp|_rig|^postgres$)' then
    raise exception 'ZZ_rig_only_kind_widening: refusing to run against database % — this scaffold is for a THROWAWAY only (name must match _ci/_test/_tmp/_rig, or be the container default `postgres`)', current_database()
      using errcode = 'CLR10';
  end if;
  raise notice 'ZZ_rig_only_kind_widening: applying to throwaway database % — NOT A DELIVERABLE', current_database();
end
$rig_only_guard$;

-- (1) LANE — the eight live values (0038:7213-7215) plus `llm_witness`.
alter table clara.document_processing_tasks drop constraint ck_processing_task_lane_0038;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_0038 check (
  lane in ('ocr','structured_parse','none','invoice_facts','local_facts','classify',
           'statement_facts','statement_parse','llm_witness'));

-- (2) LANE <-> ENGINE PREFIX — the live disjunction (0038:7238-7243) plus the witness arm.
-- The lane-blind `clara-fixture:%` first arm stands untouched (the rig's own door).
alter table clara.document_processing_tasks drop constraint ck_processing_task_lane_engine_0038;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_engine_0038 check (
  engine_id like 'clara-fixture:%'
  or (lane in ('ocr','invoice_facts','statement_facts') and engine_id like 'azure-%')
  or (lane in ('structured_parse','local_facts','none') and engine_id like 'clara-%')
  or (lane='classify' and engine_id like 'clara-classify-%')
  or (lane='statement_parse' and engine_id like 'clara-statement-%')
  or (lane='llm_witness' and engine_id like 'llm-%'));

-- (3) EXTRACTION ENGINE KIND — the five live values (0038:7254-7259) plus the two witness
-- kinds. They stay OUTSIDE the AB-3 attribution set for the same reason the statement kinds
-- do: the matcher allowlist (`engine_kind in ('ocr','structured_parse')`) is untouched here.
alter table clara.document_extractions drop constraint ck_document_extractions_engine_kind_0038;
alter table clara.document_extractions add constraint ck_document_extractions_engine_kind_0038 check (
  engine_kind in ('ocr','structured_parse','invoice_facts','doc_classify','statement_facts',
                  'llm_text_facts','llm_vision_facts'));

do $rig_only_tail$
declare v_n int;
begin
  select count(*)::int into v_n from pg_constraint
   where conname in ('ck_processing_task_lane_0038','ck_processing_task_lane_engine_0038',
                     'ck_document_extractions_engine_kind_0038')
     and pg_get_constraintdef(oid) like '%llm\_%';
  if v_n <> 3 then
    raise exception 'ZZ_rig_only_kind_widening: expected 3 widened CHECKs, found %', v_n
      using errcode = 'CLR10';
  end if;
  raise notice 'ZZ_rig_only_kind_widening: 3/3 CHECKs widened (lane, lane<->engine prefix, engine_kind) — RIG ONLY';
end
$rig_only_tail$;
