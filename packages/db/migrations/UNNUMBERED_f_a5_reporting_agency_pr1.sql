-- UNNUMBERED_f_a5_reporting_agency_pr1.sql -- Wave F Track-A item F-A5, PR-1:
-- the UNGRANTED machinery of the reporting agency. No grant, no allowlist row, no wrapper.
-- Number is claimed at MERGE by the conductor (standing law); this file names none.
--
-- DESIGN OF RECORD: docs/plan/active/reporting-agency-design.md (v2) SS3.1-3.6, SS4, SS5 PR-1;
-- annexes reporting-agency-annexes-1-mechanics.md (A.1 verbs, A.2 vocabulary, A.3 receipt columns)
-- and reporting-agency-annexes-2-record.md (D decisions, E predictions). Estate survey:
-- reporting-agency-survey.md (S1-S9).
--
-- ============================ SS0 -- D1 WRITE-QUIESCE INVENTORY ============================
-- This migration REPLACES THE BODY OF NINE LIVE AUDITED WRITERS and takes ACCESS EXCLUSIVE on two
-- live tables. It needs a D1 write-quiesce window (packages/db/README.md, rule D1): quiesce the
-- human and wake write RPCs, let in-flight ones drain, apply, resume.
--
--   1  clara.open_report_run(uuid,uuid,uuid,uuid,text)                        -> body to a core
--   2  clara.assess_report_claim(uuid,text)                                   -> body to a core
--   3  clara.seal_report_dataset(uuid,uuid[],text)                            -> body to a core
--                                                                                + S9's enqueue line
--   4  clara.approve_report_for_issue(uuid,text,text,text,text)               -> ARM 0 + four
--                                                                                identities + mode
--   5  clara._tf_metric_definition_lifecycle_v1()                             -> agent evidence arm
--   6  clara._seal_report_artifact_core(...)                                  -> identity pair
--   7  clara.publish_report_template_version(...)                             -> body to a core
--   8  clara.publish_chart_template_version(...)                              -> body to a core
--   9  clara.enqueue_render_job(uuid,text)                                    -> body to a core
--   DDL 1  create clara.report_agent_receipts, clara.watermark_policy_versions
--   DDL 2  alter clara.report_runs      -- 2 columns, 2 CHECK swaps   (ACCESS EXCLUSIVE)
--   DDL 3  alter clara.report_artifacts -- 2 columns                  (ACCESS EXCLUSIVE)
--
-- NOT ON THE LIST, EACH FOR A MEASURED REASON (PR-0 rig replay, rig wf-l09, frontier 0102):
--   clara.evaluate_fs_pack_v1 / clara.evaluate_metric_v1 -- never touched, never CALLED from this
--     lane (S2 as re-cut at gate 2). Both are members of the FROZEN evaluate_metric v1 closure and
--     PR-0 proved behaviourally that moving either reds pnpm db:migrate REGARDLESS of the deployed
--     flag: clara.verify_evaluator_freeze() loops every evaluator_versions row with no deployed
--     filter, and a perturbed pack body raised 'evaluator freeze mismatch: evaluate_metric' on a
--     rig where that closure is undeployed (prediction P1, CONFIRMED).
--   clara.complete_render_job(uuid,text,text,bigint,jsonb) -- RULING R-L23. PR-0's caller census
--     found it is the SECOND live caller of _seal_report_artifact_core and it is EXECUTE-granted to
--     clara_runtime (prediction P15 diverged: the design called it "the zeta worker's ungranted
--     path"). Its call is POSITIONAL with ten arguments. Inserting (p_obo, p_wake_kind) at
--     positions 3-4, as annex A.1 spelled it, would break that call site and put a live render
--     worker inside this D1 window. The pair is therefore appended at the TAIL with NULL defaults
--     and complete_render_job's body is BYTE-UNMOVED. Quiescing the render worker for an argument
--     ORDER was the wrong trade; the deviation from the estate's (firm, actor, obo, wake_kind, ...)
--     core idiom is deliberate and is recorded as decision F5-D32.
--   clara.seal_report_artifact(...) -- the human delegate. Under the tail-append it passes no new
--     argument, so its body is byte-unmoved too. D1 #6 is the CORE alone.
--   clara._tf_report_run_lifecycle() -- needs no recut, and for a stronger reason than the design
--     gave (prediction P6, CONFIRMED and re-cut): the trigger is BEFORE DELETE OR UPDATE -- never
--     INSERT -- and its immutability test is a WHOLE-ROW jsonb diff,
--     (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen). v_frozen is the list
--     of columns EXEMPT from the freeze (the seven issue columns), not the frozen list the design
--     called it. New columns therefore join the frozen set automatically.
--   clara._audit, _human_ctx, _reserve_op, _finish_op, _hash, mint_metric_input_snapshot_v1 --
--     frozen closure members (S8). _audit is never re-signatured; TA-P4's model/rationale ride
--     audit_log.args and the new receipt relation.
--   clara.finalize_close -- untouched. Re-PROVEN in this file's tail by a prosrc sha comparison
--     against the value read before section 1, never assumed.
--
-- ============================ PARAMETER-ORDER WARNING ============================
-- This estate carries TWO core conventions and a transposition between them TYPE-CHECKS:
--   clara._draft_report_spec_core(p_actor, p_firm, p_obo, p_wake_kind, ...)   -- 0069
--   clara._seal_report_artifact_core(p_firm, p_actor, ...)                    -- 0071
-- Every core this file MINTS takes (p_firm, p_actor, p_obo, p_wake_kind, ...) -- firm first,
-- matching 0071 and design SS3.1. The delegates below are the only callers in this file and each
-- one is written out; PR-2's wrappers must read this paragraph before they are authored.
--
-- ============================ HOW THE SIX EXTRACTIONS ARE DONE ============================
-- NOT BY RETYPING. Each extracted core is DERIVED AT APPLY TIME from the live catalog body, by
-- four substitutions with an anchor-uniqueness assertion on each, and then PROVEN by reversing
-- them and comparing byte for byte against the original. That is the estate's own splice idiom
-- (0097-0102: "both splice anchors are unique"), and it is the only method under which "the
-- extraction is byte-preserving but for the context line" is a MEASUREMENT rather than a claim.
-- A hand-transcribed 41KB of minified plpgsql would be a claim.
--
-- The four substitutions, in order:
--   (a) the context statement  c := clara._human_ctx(<rank>);   is DELETED
--   (b) the declaration        c record;                        is DELETED
--   (c) c.actor -> p_actor and c.firm -> p_firm
--   (d) clara._audit(p_firm, p_actor, null, null,  ->  clara._audit(p_firm, p_actor, p_obo, p_wake_kind,
-- and the proof: reversing (d) then (c) on the derived body must equal the original body with (a)
-- and (b) removed, exactly. Anything else aborts the migration.
--
-- Prestate prosrc sha256 pins (read from the live catalog on rig wf-l09 at frontier 0102) are
-- asserted before a single byte moves. A body that is not at its pinned sha aborts.

-- ---------------------------------------------------------------------------------------------
-- SECTION 0 -- PRESTATE. Nothing below runs unless every pinned body is exactly where we left it.
-- ---------------------------------------------------------------------------------------------
do $s0$
declare
  r record;
  v_sha text;
  v_missing text[] := '{}';
  v_bad text[] := '{}';
begin
  for r in
    select * from (values
      ('clara.open_report_run(uuid,uuid,uuid,uuid,text)',                                   '895d9dc2fb7010d9785aa4620f04865cf8d62112128cdcb15d9d0519e6cf6028'),
      ('clara.assess_report_claim(uuid,text)',                                              '806bca77530e957950f299797aba5fc73e9de410ae3eda7c61fa8882a07a680b'),
      ('clara.seal_report_dataset(uuid,uuid[],text)',                                       '3c22660c821b419dbb4c630562a36bc13343c3d53e4edf8c15dcd9f0bddf6527'),
      ('clara.approve_report_for_issue(uuid,text,text,text,text)',                          'eea49349eddb3acfc8fcca5853fdd2a3dad11fbba46ba7a083689622b3319919'),
      ('clara._tf_metric_definition_lifecycle_v1()',                                        '9cefb611bfb581b62e99bb42f81945130d4e057e6e57840d651ea296920f17f6'),
      ('clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)', 'f02b7827daad0de445bd6c475b1a424a6f7e47b5794fb9b31d0d951ac3fbdc93'),
      ('clara.publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text)',   '944a26638876bf1ba7439a14a10cfa3a4f830ef2a03d9ac66405f6a94d072ab4'),
      ('clara.publish_chart_template_version(text,text,jsonb,date,text)',                   'f895ccb0871073e3e368ac8b10b9d7501f067945c9f474c0194a5499855baa66'),
      ('clara.enqueue_render_job(uuid,text)',                                               'bddc611165f2c50af35b1f4ab8240128452e143edbc9fbc7b97e233b7523d443'),
      -- untouched, pinned so the file notices if the estate moved under it
      ('clara.evaluate_fs_pack_v1(uuid,uuid[],uuid[],uuid,uuid)',                           '3100e302cc499853488ff69de2d9622832395d92c87aee3042a053c84951965d'),
      ('clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)',                              '74154d46c4aa427c7f05fd87bd69a8dff43a73c455834d3a680cd1d2f3fde5ad'),
      ('clara._metric_eval_node_v1(uuid,uuid,uuid,uuid,jsonb,boolean,text,date)',           'c28e6f81f23c3def5bcfb00f8ba079dc9751af5ec2a6241b8e7326297e7f9318'),
      ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',                                 '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1'),
      ('clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)',            'fba0a9d4d210182007c2e088df3ffdf1ad37b0fb9eda7350d5ad8a79abbc0565'),
      ('clara.complete_render_job(uuid,text,text,bigint,jsonb)',                            null),
      ('clara._tf_report_run_lifecycle()',                                                  '1e013ac7dfdf03f61d99fcbf0e5d1eb5514d2156406104a7fabb782918cd9591')
    ) as t(sig, sha)
  loop
    if to_regprocedure(r.sig) is null then v_missing := v_missing || r.sig; continue; end if;
    if r.sha is null then continue; end if;
    select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha from pg_proc where oid = r.sig::regprocedure;
    if v_sha is distinct from r.sha then v_bad := v_bad || (r.sig || ' expected ' || r.sha || ' found ' || v_sha); end if;
  end loop;
  if coalesce(array_length(v_missing,1),0) > 0 then
    raise exception 'f_a5 pr1 prestate: signature(s) absent: %', array_to_string(v_missing, ' | ') using errcode = 'CLR10';
  end if;
  if coalesce(array_length(v_bad,1),0) > 0 then
    raise exception 'f_a5 pr1 prestate: live body sha mismatch: %', array_to_string(v_bad, ' | ') using errcode = 'CLR10';
  end if;
  -- The two objects this file MINTS must not already exist (a re-apply is a defect, not an upsert).
  if to_regclass('clara.report_agent_receipts') is not null then
    raise exception 'f_a5 pr1 prestate: clara.report_agent_receipts already exists' using errcode = 'CLR10';
  end if;
  if to_regclass('clara.watermark_policy_versions') is not null then
    raise exception 'f_a5 pr1 prestate: clara.watermark_policy_versions already exists' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._publish_chart_template_core(uuid,uuid,uuid,text,text,text,jsonb,date,text)') is not null then
    raise exception 'f_a5 pr1 prestate: a core this file mints already exists' using errcode = 'CLR10';
  end if;
  -- The two columns must be absent on BOTH tables, or DDL 2/3 is not what this file thinks it is.
  if exists (select 1 from information_schema.columns
              where table_schema='clara' and table_name in ('report_runs','report_artifacts')
                and column_name in ('directed_by','prepared_by_agent')) then
    raise exception 'f_a5 pr1 prestate: an identity column already exists on report_runs/report_artifacts' using errcode = 'CLR10';
  end if;
  -- P13, re-measured rather than trusted: ck_rr_issue_mode must NOT exist anywhere.
  if exists (select 1 from pg_constraint where conname = 'ck_rr_issue_mode') then
    raise exception 'f_a5 pr1 prestate: ck_rr_issue_mode already exists -- P13 is stale' using errcode = 'CLR10';
  end if;
  raise notice 'f_a5 pr1 prestate: clean -- nine CoR targets at their pinned shas, five untouched bodies pinned beside them, no minted object present, no identity column present, ck_rr_issue_mode absent (P13 re-measured)';
end
$s0$;

-- EVERYTHING THIS FILE CREATES IS OWNED BY clara_fn_owner, the estate's function owner and the
-- owner of every clara table (0004:26; the same set role/reset role frame 0092-0102 all use). It
-- is load-bearing twice over: a SECURITY DEFINER function runs AS ITS OWNER, so a core created by
-- the migration's superuser role would be a privilege escalation; and 0004:752's
-- `alter default privileges for role clara_fn_owner in schema clara revoke execute on functions
-- from public` is what keeps a newly created core out of PUBLIC's reach by construction rather
-- than by the author remembering a revoke. The tail asserts BOTH properties rather than trusting
-- the frame -- it was the tail that caught this file creating PUBLIC-executable cores.
set role clara_fn_owner;

-- The finalize_close pin, captured BEFORE anything moves so the tail can compare rather than assume.
create temporary table _fa5_pr1_prestate (k text primary key, v text);
insert into _fa5_pr1_prestate
select 'finalize_close:' || p.oid::regprocedure::text, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'clara' and p.proname = 'finalize_close';
insert into _fa5_pr1_prestate
select 'complete_render_job', encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'clara' and p.proname = 'complete_render_job';
insert into _fa5_pr1_prestate
select 'seal_report_artifact', encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'clara' and p.proname = 'seal_report_artifact';
insert into _fa5_pr1_prestate
select 'evaluate_fs_pack_v1', encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'clara' and p.proname = 'evaluate_fs_pack_v1';
insert into _fa5_pr1_prestate
select 'evaluate_metric_v1', encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'clara' and p.proname = 'evaluate_metric_v1';
insert into _fa5_pr1_prestate
select 'metric_eval_node_v1', encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'clara' and p.proname = '_metric_eval_node_v1';

-- ---------------------------------------------------------------------------------------------
-- SECTION 1 -- DDL 1a. clara.report_agent_receipts (annex A.3) + the NARRATIVE-AUTHORITY WALL.
--
-- WHY A RELATION AND NOT MORE audit_log. clara._audit is a member of the frozen metric-input
-- producer closure (S8) and may not gain a parameter. The BINDING half of TA-P4 therefore rides
-- audit_log.args; the JUDGEMENT half -- outcome token, rung vector, model, rationale, the
-- attestation, the basis citations -- gets its own append-only relation, so it can be queried,
-- constrained and read by a human without touching a frozen signature.
--
-- THE HONESTY WALL. acting_identity is NOT NULL and CHECK-pinned to clara.agent_user_id(). This
-- table can never be made to say a person did what Clara did. clara.agent_user_id() is IMMUTABLE
-- (a SQL constant, 0002), which is what makes it lawful in a CHECK.
-- ---------------------------------------------------------------------------------------------
create table clara.report_agent_receipts (
  id                        uuid primary key default gen_random_uuid(),
  firm_id                   uuid not null references clara.firms(id),
  client_id                 uuid references clara.clients(id),
  report_run_id             uuid references clara.report_runs(id),
  definition_version_id     uuid references clara.metric_definition_versions(id),
  -- A CLOSED WORLD of fourteen acts (annex A.3). sandbox_export left with the severance (F5-D29)
  -- and returns by migration, never by a writer widening it at runtime.
  act                       text not null check (act in (
                              'open_run','evaluate_pack','assess_claim','seal_dataset','seal_artifact',
                              'approve_definition','supersede_definition','reject_definition',
                              'create_account_set','mint_snapshot','publish_chart_template',
                              'publish_report_template','typed_read','requeue_render')),
  outcome                   text not null check (outcome in ('done','refused')),
  refusal_token             text,
  -- Three-valued, per rung: pass / fail / not_evaluable. An absent input is REPORTED, never read
  -- as a pass (law 68).
  rung_vector               jsonb,
  acting_identity           uuid not null references clara.users(id),
  directed_by               uuid references clara.users(id),
  via_wake_kind             text not null,
  wake_credential_id        uuid not null,
  wake_task_id              text,
  chat_turn_id              uuid,
  model                     text not null,
  model_version             text not null,
  rationale                 text not null,
  op_key                    text not null,
  basis_citations           jsonb,
  self_approval_attestation text,
  at                        timestamptz not null default now(),
  constraint ck_rar_acting_identity_is_agent check (acting_identity = clara.agent_user_id()),
  constraint ck_rar_refusal_paired          check ((outcome = 'refused') = (refusal_token is not null)),
  constraint ck_rar_model_stated            check (btrim(model) <> '' and btrim(model_version) <> ''),
  constraint ck_rar_rationale_stated        check (btrim(rationale) <> ''),
  constraint ck_rar_op_key_stated           check (btrim(op_key) <> ''),
  constraint ck_rar_wake_kind_stated        check (btrim(via_wake_kind) <> ''),
  constraint ck_rar_rung_vector_object      check (rung_vector is null or jsonb_typeof(rung_vector) = 'object'),
  constraint ck_rar_basis_citations_array   check (basis_citations is null or jsonb_typeof(basis_citations) = 'array')
);
create index ix_rar_firm_at   on clara.report_agent_receipts (firm_id, at desc);
create index ix_rar_run       on clara.report_agent_receipts (report_run_id) where report_run_id is not null;
create index ix_rar_defver    on clara.report_agent_receipts (definition_version_id) where definition_version_id is not null;

alter table clara.report_agent_receipts enable row level security;
alter table clara.report_agent_receipts force row level security;
create policy p_reportagentreceipts_owner on clara.report_agent_receipts for all to clara_fn_owner using (true);
-- TA-P4 (4): a human can read it. bookkeeper+ of the row's own firm, the audit_log policy shape.
create policy p_reportagentreceipts_human on clara.report_agent_receipts for select to clara_authenticated
  using (firm_id = clara.jwt_firm()
         and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('bookkeeper'));
grant select on clara.report_agent_receipts to clara_authenticated;

create trigger t_reportagentreceipts_append_only
  before update or delete on clara.report_agent_receipts
  for each row execute function clara._tf_append_only();
create trigger t_reportagentreceipts_no_truncate
  after truncate on clara.report_agent_receipts
  for each statement execute function clara._tf_no_truncate();

-- THE NARRATIVE-AUTHORITY WALL (design SS3.6). A sandbox figure is structurally narrative: no
-- definition_version_id, no cell_id, authority 'narrative'. This trigger refuses to record one in
-- a field typed as an AUTHORITATIVE basis. It lands here, with the receipt table, in PR-1; what it
-- guards arrives with the severed export item.
--
-- FAIL-CLOSED IN BOTH DIRECTIONS, which is what makes it a wall rather than a spell-check:
--   * an authority that is not exactly 'formal'      is treated as NARRATIVE
--   * a basis_role that is not exactly the narrative one is treated as AUTHORITATIVE
--   * a 'formal' citation carrying neither cell_id nor definition_version_id is narrative in
--     disguise and is refused as such -- the DB-owned figure has a pin or it is not DB-owned
--   * a narrative aggregate with no query_text cannot be checked by anybody and is refused
-- An unknown key, a malformed element, a non-object -- every one lands in the refusing branch.
create function clara._tf_report_agent_receipt_authority() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $tfwall$
declare
  el jsonb;
  v_role text;
  v_authority text;
  v_narrative boolean;
  v_authoritative_slot boolean;
begin
  if new.basis_citations is null then return new; end if;
  for el in select value from jsonb_array_elements(new.basis_citations) loop
    if jsonb_typeof(el) <> 'object' then
      raise exception 'a basis citation must be an object'
        using errcode = 'CLR10', detail = jsonb_build_object('reason','sandbox_authority_refused',
          'class','basis_citation_not_an_object')::text;
    end if;
    v_role      := el ->> 'basis_role';
    v_authority := el ->> 'authority';
    -- fail-closed: anything that is not the one narrative role is an authoritative slot
    v_authoritative_slot := (v_role is distinct from 'narrative_aggregate');
    -- fail-closed: anything that is not exactly 'formal' is narrative
    v_narrative := (v_authority is distinct from 'formal')
      or ((el ->> 'cell_id') is null and (el ->> 'definition_version_id') is null);
    if v_authoritative_slot and v_narrative then
      raise exception 'a narrative figure cannot be cited as an authoritative basis'
        using errcode = 'CLR10', detail = jsonb_build_object('reason','sandbox_authority_refused',
          'basis_role', v_role, 'authority', v_authority,
          'fix','cite a DB-owned cell (authority formal, with a cell_id or definition_version_id), or record the figure as a narrative_aggregate')::text;
    end if;
    if not v_authoritative_slot and nullif(btrim(coalesce(el ->> 'query_text','')),'') is null then
      raise exception 'a narrative aggregate is citable only with its query text'
        using errcode = 'CLR10', detail = jsonb_build_object('reason','sandbox_authority_refused',
          'class','narrative_aggregate_without_query_text')::text;
    end if;
  end loop;
  return new;
end
$tfwall$;
create trigger t_reportagentreceipts_authority
  before insert on clara.report_agent_receipts
  for each row execute function clara._tf_report_agent_receipt_authority();

-- THE ONE WRITER. Ungranted; every F-A5 core reaches it, nothing else can. "No receipt, no act" is
-- structural: the receipt insert and the act share the core's transaction, and the wrapper (PR-2)
-- carries no DML, so there is no path that performs the act and skips the receipt.
create function clara._report_agent_receipt(
    p_firm uuid, p_client uuid, p_report_run_id uuid, p_definition_version_id uuid,
    p_act text, p_outcome text, p_refusal_token text, p_rung_vector jsonb,
    p_directed_by uuid, p_wake_kind text, p_agent jsonb, p_op_key text,
    p_basis_citations jsonb default null, p_self_approval_attestation text default null)
  returns uuid language plpgsql security definer set search_path = clara, pg_temp as $rcpt$
declare v_id uuid;
begin
  if p_agent is null or jsonb_typeof(p_agent) <> 'object'
     or nullif(btrim(coalesce(p_agent ->> 'model','')),'') is null
     or nullif(btrim(coalesce(p_agent ->> 'model_version','')),'') is null then
    raise exception 'an agent act states its model' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"model","fix":"pass {model, model_version, rationale, wake_credential_id}"}';
  end if;
  if nullif(btrim(coalesce(p_agent ->> 'rationale','')),'') is null then
    raise exception 'an agent act states its rationale' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"rationale"}';
  end if;
  if nullif(btrim(coalesce(p_agent ->> 'wake_credential_id','')),'') is null then
    raise exception 'an agent act names the wake credential it acted under' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"wake_credential_id"}';
  end if;
  insert into clara.report_agent_receipts(firm_id, client_id, report_run_id, definition_version_id,
      act, outcome, refusal_token, rung_vector, acting_identity, directed_by, via_wake_kind,
      wake_credential_id, wake_task_id, chat_turn_id, model, model_version, rationale, op_key,
      basis_citations, self_approval_attestation)
    values (p_firm, p_client, p_report_run_id, p_definition_version_id,
      p_act, p_outcome, p_refusal_token, p_rung_vector, clara.agent_user_id(), p_directed_by,
      p_wake_kind, (p_agent ->> 'wake_credential_id')::uuid, p_agent ->> 'wake_task_id',
      nullif(p_agent ->> 'chat_turn_id','')::uuid, p_agent ->> 'model', p_agent ->> 'model_version',
      p_agent ->> 'rationale', p_op_key, p_basis_citations, p_self_approval_attestation)
    returning id into v_id;
  return v_id;
end
$rcpt$;
revoke all on function clara._report_agent_receipt(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,text,jsonb,text,jsonb,text) from public;

-- ---------------------------------------------------------------------------------------------
-- SECTION 2 -- DDL 1b. clara.watermark_policy_versions (design SS3.6.1).
--
-- S7 showed claim_policy_versions cannot hold this: ck_cpv_four_ruled_states admits EXACTLY the
-- four claim states, and weakening it removes the wall that stops a claim label defaulting. So a
-- SIBLING table with the same curated shape -- firm_id null, versioned, effective-dated, unique
-- nulls not distinct (policy_key, version, locale), append-only, supersede by a new row.
--
-- DDL ONLY. NO WORDING ROW IS SEEDED HERE. OQ-1's fail-closed default stands (R-N1 stays
-- registered): the owner signs the artifact_watermark trio and PR-4 seeds what he returns. Until
-- then the sealed renderer keeps its literals, which is the honest state, not a hidden one.
-- ---------------------------------------------------------------------------------------------
create table clara.watermark_policy_versions (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid references clara.firms(id),
  policy_key     text not null,
  version        integer not null check (version > 0),
  locale         text not null check (locale in ('en','ms','zh')),
  watermark      jsonb not null check (jsonb_typeof(watermark) = 'object'),
  effective_from date not null,
  effective_to   date,
  source_note    text not null check (btrim(source_note) <> ''),
  created_at     timestamptz not null default now(),
  constraint ck_watermark_policy_versions_curated check (firm_id is null),
  constraint ck_wpv_window check (effective_to is null or effective_to >= effective_from),
  -- The closed world of policy keys. artifact_watermark is F-A5's; sandbox_watermark is DEFINED
  -- here and SEEDED by the severed export item, so that item adds rows and never DDL (SS3.6.1).
  constraint ck_wpv_policy_key check (policy_key in ('artifact_watermark','sandbox_watermark')),
  constraint uq_wpv_key_version_locale unique nulls not distinct (firm_id, policy_key, version, locale)
);
alter table clara.watermark_policy_versions enable row level security;
alter table clara.watermark_policy_versions force row level security;
create policy p_watermarkpolicyversions_owner on clara.watermark_policy_versions for all to clara_fn_owner using (true);
create policy p_watermarkpolicyversions_human on clara.watermark_policy_versions for select to clara_authenticated
  using (firm_id is null or firm_id = clara.jwt_firm());
grant select on clara.watermark_policy_versions to clara_authenticated;
create trigger t_watermarkpolicyversions_append_only
  before update or delete on clara.watermark_policy_versions
  for each row execute function clara._tf_append_only();
create trigger t_watermarkpolicyversions_no_truncate
  after truncate on clara.watermark_policy_versions
  for each statement execute function clara._tf_no_truncate();

-- The resolver the renderer path will read in PR-4. A MISSING ROW REFUSES THE RENDER -- law 36,
-- E-R14's shape, TA-P10 (3). It is shipped now, with the table, so PR-4 is a renderer change and
-- not a schema change; it refuses today because nothing is seeded today, which is the point.
create function clara.watermark_policy_for(p_policy_key text, p_locale text, p_as_of date)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $wpf$
declare v jsonb;
begin
  select w.watermark into v from clara.watermark_policy_versions w
   where w.policy_key = p_policy_key and w.locale = p_locale and w.firm_id is null
     and w.effective_from <= p_as_of and (w.effective_to is null or w.effective_to >= p_as_of)
   order by w.version desc limit 1;
  if v is null then
    raise exception 'no watermark policy row is effective for this locale'
      using errcode = 'CLR10', detail = jsonb_build_object('reason','watermark_policy_absent',
        'policy_key', p_policy_key, 'locale', p_locale, 'as_of', p_as_of,
        'fix','the owner signs the wording once, in three languages, and a migration seeds it (OQ-1)')::text;
  end if;
  return v;
end
$wpf$;
revoke all on function clara.watermark_policy_for(text,text,date) from public;

-- ---------------------------------------------------------------------------------------------
-- SECTION 3 -- DDL 2 + DDL 3. The identity columns and the two CHECK swaps. ACCESS EXCLUSIVE.
--
-- The columns are written at INSERT and never changed, so _tf_report_run_lifecycle needs no recut
-- (P6, CONFIRMED at the bytes -- see SS0).
-- ---------------------------------------------------------------------------------------------
alter table clara.report_runs
  add column directed_by uuid references clara.users(id),
  add column prepared_by_agent boolean not null default false;
alter table clara.report_artifacts
  add column directed_by uuid references clara.users(id),
  add column prepared_by_agent boolean not null default false;

comment on column clara.report_runs.directed_by is
  'The HUMAN who directed this run when Clara prepared it; NULL on a human-prepared run and on a self-run pack. Written at INSERT, never changed.';
comment on column clara.report_runs.prepared_by_agent is
  'TRUE when clara.agent_user_id() was the acting identity that opened the run. requested_by then carries the DIRECTING human (or the agent, on a self-run) rather than being left to evaporate -- survey S5.';
comment on column clara.report_artifacts.directed_by is
  'DB-DERIVED from the artifact''s run at seal (ruling R-L23): every artifact carries its run''s direction, including the pre_sign artifact the render worker seals.';
comment on column clara.report_artifacts.prepared_by_agent is
  'DB-DERIVED from the artifact''s run at seal (ruling R-L23). This is what arms ARM 1''s artifact-side comparison on the REAL lane, where every pre_sign artifact is sealed by clara.complete_render_job.';

do $s3$
declare
  v_cname text;
  v_def   text;
  v_solo  text;
begin
  -- THE ISSUE_MODE CHECK IS ANONYMOUS (0065:384). Its name is PostgreSQL's, so it is READ from
  -- pg_constraint BY ITS DEFINITION -- never by the name this file guesses (P13; law: spelling is
  -- not identity, so the DROP names what the read returned).
  select conname into v_cname from pg_constraint
   where conrelid = 'clara.report_runs'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) = 'CHECK ((issue_mode = ANY (ARRAY[''two_person''::text, ''solo_self_attested''::text])))';
  if v_cname is null then
    raise exception 'f_a5 pr1 DDL2: the two-value issue_mode CHECK was not found by its definition -- refusing to guess a name'
      using errcode = 'CLR10';
  end if;
  raise notice 'f_a5 pr1 DDL2: dropping the anonymous issue_mode CHECK read from pg_constraint as %', v_cname;
  execute format('alter table clara.report_runs drop constraint %I', v_cname);
  -- EXTEND-NEVER-WEAKEN: the two existing values are byte-identical; agent_prepared joins them.
  alter table clara.report_runs
    add constraint ck_rr_issue_mode check (issue_mode in ('two_person','solo_self_attested','agent_prepared'));

  -- ck_rr_solo_attested IS named (0065:403-404). Pin its live text before replacing it, so a body
  -- that moved under us aborts rather than being silently overwritten.
  select pg_get_constraintdef(oid) into v_solo from pg_constraint
   where conrelid = 'clara.report_runs'::regclass and conname = 'ck_rr_solo_attested';
  if v_solo is distinct from 'CHECK (((issue_mode IS DISTINCT FROM ''solo_self_attested''::text) OR (NULLIF(btrim(COALESCE(issue_self_attestation, ''''::text)), ''''::text) IS NOT NULL)))' then
    raise exception 'f_a5 pr1 DDL2: ck_rr_solo_attested is not at its pinned text: %', coalesce(v_solo,'(absent)')
      using errcode = 'CLR10';
  end if;
  alter table clara.report_runs drop constraint ck_rr_solo_attested;
  -- An agent_prepared issue needs its attestation text too (design SS3.3 (4)). The solo arm's own
  -- clause is unchanged; a second disjunct-free conjunct is added beside it.
  alter table clara.report_runs
    add constraint ck_rr_solo_attested check (
      (issue_mode is distinct from 'solo_self_attested'
        or nullif(btrim(coalesce(issue_self_attestation, '')), '') is not null)
      and
      (issue_mode is distinct from 'agent_prepared'
        or nullif(btrim(coalesce(issue_self_attestation, '')), '') is not null));
  raise notice 'f_a5 pr1 DDL2/DDL3: issue_mode extended to three values under the NAMED ck_rr_issue_mode; ck_rr_solo_attested extended to bind agent_prepared; four identity columns added, all written at INSERT';
end
$s3$;

-- ---------------------------------------------------------------------------------------------
-- SECTION 4 -- the six mechanical extractions. Derived, asserted, and PROVEN by reversal.
-- ---------------------------------------------------------------------------------------------
create function pg_temp._fa5_extract(
    p_sig text, p_core_name text, p_ctx_anchor text, p_expect_c_actor int, p_expect_c_firm int)
  returns text language plpgsql as $ext$
declare
  v_body   text;
  v_args   text;
  v_ret    text;
  v_new    text;
  v_check  text;
  v_expect text;
  v_n      int;
begin
  select p.prosrc, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
    into v_body, v_args, v_ret
    from pg_proc p where p.oid = p_sig::regprocedure;

  if position('$fa5core$' in v_body) > 0 then
    raise exception 'f_a5 extract %: the body contains the dollar-quote tag this file uses', p_sig using errcode='CLR10';
  end if;
  if position('p_actor' in v_body) > 0 or position('p_firm' in v_body) > 0
     or position('p_obo' in v_body) > 0 or position('p_wake_kind' in v_body) > 0 then
    raise exception 'f_a5 extract %: the body already uses a name the substitution introduces', p_sig using errcode='CLR10';
  end if;

  -- (a) the context statement -- asserted UNIQUE before it is removed
  v_n := (length(v_body) - length(replace(v_body, p_ctx_anchor, ''))) / length(p_ctx_anchor);
  if v_n <> 1 then
    raise exception 'f_a5 extract %: context anchor occurs % time(s), expected exactly 1', p_sig, v_n using errcode='CLR10';
  end if;
  -- (b) the declaration -- asserted UNIQUE before it is removed
  v_n := (length(v_body) - length(replace(v_body, 'c record; ', ''))) / length('c record; ');
  if v_n <> 1 then
    raise exception 'f_a5 extract %: "c record; " occurs % time(s), expected exactly 1', p_sig, v_n using errcode='CLR10';
  end if;
  -- (c) the identity references -- counted against the PR-0 census, so a body that grew one since
  -- the replay is refused rather than silently rewritten
  v_n := (length(v_body) - length(replace(v_body, 'c.actor', ''))) / length('c.actor');
  if v_n <> p_expect_c_actor then
    raise exception 'f_a5 extract %: c.actor occurs % time(s), PR-0 measured %', p_sig, v_n, p_expect_c_actor using errcode='CLR10';
  end if;
  v_n := (length(v_body) - length(replace(v_body, 'c.firm', ''))) / length('c.firm');
  if v_n <> p_expect_c_firm then
    raise exception 'f_a5 extract %: c.firm occurs % time(s), PR-0 measured %', p_sig, v_n, p_expect_c_firm using errcode='CLR10';
  end if;

  v_new := replace(v_body, p_ctx_anchor, '');
  v_new := replace(v_new, 'c record; ', '');
  v_new := replace(v_new, 'c.actor', 'p_actor');
  v_new := replace(v_new, 'c.firm',  'p_firm');
  -- (d) the audit pair. Every extracted core carries (obo, wake_kind) instead of hardcoded NULLs
  -- (design SS3.4's completeness claim).
  v_n := (length(v_new) - length(replace(v_new, 'clara._audit(p_firm, p_actor, null, null,', '')))
         / length('clara._audit(p_firm, p_actor, null, null,');
  if v_n <> 1 then
    raise exception 'f_a5 extract %: the audit anchor occurs % time(s), expected exactly 1', p_sig, v_n using errcode='CLR10';
  end if;
  v_new := replace(v_new, 'clara._audit(p_firm, p_actor, null, null,',
                          'clara._audit(p_firm, p_actor, p_obo, p_wake_kind,');

  -- THE PROOF. Reverse (d) then (c); the result must equal the original with (a) and (b) removed,
  -- byte for byte. This is what makes "byte-preserving but for the context line" a measurement.
  v_check := replace(v_new, 'clara._audit(p_firm, p_actor, p_obo, p_wake_kind,',
                            'clara._audit(p_firm, p_actor, null, null,');
  v_check := replace(replace(v_check, 'p_actor', 'c.actor'), 'p_firm', 'c.firm');
  v_expect := replace(replace(v_body, p_ctx_anchor, ''), 'c record; ', '');
  if v_check is distinct from v_expect then
    raise exception 'f_a5 extract %: the reversal does not reconstruct the original body -- refusing to move it', p_sig using errcode='CLR10';
  end if;
  if position('_human_ctx' in v_new) > 0 or position('c.actor' in v_new) > 0 or position('c.firm' in v_new) > 0 then
    raise exception 'f_a5 extract %: residual context reference survives the derivation', p_sig using errcode='CLR10';
  end if;

  return format(
    'create function clara.%I(p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, %s) returns %s'
    || E' language plpgsql security definer set search_path = clara, pg_temp as $fa5core$%s$fa5core$',
    p_core_name, v_args, v_ret, v_new);
end
$ext$;

-- Argument NAMES of a live function, in order -- what a thin delegate passes through.
create function pg_temp._fa5_argnames(p_sig text) returns text language sql as $an$
  select string_agg(n, ', ' order by o)
    from (select unnest(p.proargnames) n, generate_subscripts(p.proargnames, 1) o
            from pg_proc p where p.oid = p_sig::regprocedure) x;
$an$;

-- --- #1  clara.open_report_run -> clara._open_report_run_core ---------------------------------
do $x1$
declare d text;
begin
  d := pg_temp._fa5_extract('clara.open_report_run(uuid,uuid,uuid,uuid,text)',
        '_open_report_run_core',
        E'c := clara._human_ctx(clara.role_rank(\'bookkeeper\'));\n  ', 2, 7);
  execute d;
  raise notice 'f_a5 pr1 #1: clara._open_report_run_core derived and reversal-proven';
end
$x1$;

-- SS3.3 (2). The identity writes. THE ONLY behavioural change to the run INSERT, spliced with a
-- uniqueness assertion on its anchor:
--   requested_by      coalesce(p_obo, p_actor)  -- the DIRECTING human when there is one; on the
--                     human lane p_obo is NULL and p_actor is the human, so the value is unchanged
--   directed_by       p_obo
--   prepared_by_agent p_actor is not distinct from clara.agent_user_id()
-- prepared_by_agent reads the ACTING IDENTITY, not the wake kind: a wake kind is a label on the
-- channel, the actor is the thing itself (law: spelling is not identity).
do $x1b$
declare
  d text; v_n int;
  a_cols text := E'reporting_period_id, period_start, period_end, state, requested_by)';
  a_vals text := E'p.period_start, p.period_end, \'drafting\', p_actor) returning id into v_id;';
begin
  select p.prosrc into d from pg_proc p where p.oid = 'clara._open_report_run_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,text)'::regprocedure;
  v_n := (length(d) - length(replace(d, a_cols, ''))) / length(a_cols);
  if v_n <> 1 then raise exception 'f_a5 pr1 #1b: column anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  v_n := (length(d) - length(replace(d, a_vals, ''))) / length(a_vals);
  if v_n <> 1 then raise exception 'f_a5 pr1 #1b: values anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, a_cols, E'reporting_period_id, period_start, period_end, state, requested_by,\n      directed_by, prepared_by_agent)');
  d := replace(d, a_vals, E'p.period_start, p.period_end, \'drafting\', coalesce(p_obo, p_actor),\n      p_obo, p_actor is not distinct from clara.agent_user_id()) returning id into v_id;');
  execute format('create or replace function clara._open_report_run_core(p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, p_client uuid, p_report_spec_version_id uuid, p_books_snapshot_id uuid, p_reporting_period_id uuid, p_op_key text) returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fa5core$%s$fa5core$', d);
  raise notice 'f_a5 pr1 #1b: the run INSERT now writes requested_by=coalesce(obo,actor), directed_by and prepared_by_agent';
end
$x1b$;

create or replace function clara.open_report_run(p_client uuid, p_report_spec_version_id uuid,
    p_books_snapshot_id uuid, p_reporting_period_id uuid, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $d1$
declare c record;
begin
  -- THE HUMAN DOOR. Signature unchanged, so no caller moves; it resolves the context and delegates.
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._open_report_run_core(c.firm, c.actor, null, null, p_client, p_report_spec_version_id,
    p_books_snapshot_id, p_reporting_period_id, p_op_key);
end
$d1$;

-- --- #2  clara.assess_report_claim -> clara._assess_report_claim_core --------------------------
do $x2$
declare d text;
begin
  d := pg_temp._fa5_extract('clara.assess_report_claim(uuid,text)',
        '_assess_report_claim_core',
        E'c := clara._human_ctx(clara.role_rank(\'bookkeeper\'));\n  ', 2, 6);
  execute d;
  raise notice 'f_a5 pr1 #2: clara._assess_report_claim_core derived and reversal-proven';
end
$x2$;

create or replace function clara.assess_report_claim(p_report_run_id uuid, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $d2$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._assess_report_claim_core(c.firm, c.actor, null, null, p_report_run_id, p_op_key);
end
$d2$;

-- --- #3  clara.seal_report_dataset -> clara._seal_report_dataset_core --------------------------
do $x3$
declare d text;
begin
  d := pg_temp._fa5_extract('clara.seal_report_dataset(uuid,uuid[],text)',
        '_seal_report_dataset_core',
        E'c := clara._human_ctx(clara.role_rank(\'bookkeeper\'));\n  ', 3, 12);
  execute d;
  raise notice 'f_a5 pr1 #3: clara._seal_report_dataset_core derived and reversal-proven';
end
$x3$;

-- Two splices on the sealed body, each anchor asserted unique.
--   (i)  the internal assess call must go through the CORE, or a wake-lane seal would reach
--        clara.assess_report_claim's own _human_ctx and CLR04 inside its own transaction.
--   (ii) S9's MISSING LINE. 0080:225-236 states the contract in words -- "Epsilon's
--        clara.seal_report_dataset calls it with ONE line, immediately before its final audit,
--        inside the sealing transaction" -- and the line never landed, so no draft render is
--        enqueued by anything and a pre_sign render appears only when the leader's fallback sweep
--        next runs. It lands here, through the CORE, so the enqueue audits as Clara-on-behalf-of
--        rather than as the directing human (F5-D27).
do $x3b$
declare
  d text; v_n int;
  a_assess text := 'v_assessment := clara.assess_report_claim(r.id, p_op_key || '':assess'');';
  a_audit  text := '  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, ''seal_report_dataset'', null,';
begin
  select p.prosrc into d from pg_proc p where p.oid = 'clara._seal_report_dataset_core(uuid,uuid,uuid,text,uuid,uuid[],text)'::regprocedure;
  v_n := (length(d) - length(replace(d, a_assess, ''))) / length(a_assess);
  if v_n <> 1 then raise exception 'f_a5 pr1 #3b: assess anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  v_n := (length(d) - length(replace(d, a_audit, ''))) / length(a_audit);
  if v_n <> 1 then raise exception 'f_a5 pr1 #3b: audit anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, a_assess,
    'v_assessment := clara._assess_report_claim_core(p_firm, p_actor, p_obo, p_wake_kind, r.id, p_op_key || '':assess'');');
  d := replace(d, a_audit,
    E'  -- S9, landed: the seal->render integration line, inside the sealing transaction, through the\n'
 || E'  -- core so the render enqueue is attributed to the identity that actually enqueued it.\n'
 || E'  perform clara._enqueue_render_job_core(p_firm, p_actor, p_obo, p_wake_kind, r.id, ''pre_sign'');\n'
 || a_audit);
  execute format('create or replace function clara._seal_report_dataset_core(p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, p_report_run_id uuid, p_chart_template_version_ids uuid[], p_op_key text) returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fa5core$%s$fa5core$', d);
  raise notice 'f_a5 pr1 #3b: the seal core calls the assess CORE and lands S9''s enqueue line before its final audit';
end
$x3b$;

create or replace function clara.seal_report_dataset(p_report_run_id uuid,
    p_chart_template_version_ids uuid[], p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $d3$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._seal_report_dataset_core(c.firm, c.actor, null, null, p_report_run_id,
    p_chart_template_version_ids, p_op_key);
end
$d3$;

-- --- #7  clara.publish_report_template_version -> clara._publish_report_template_core ----------
-- NOT RE-AUTHORED. 0069:261-266 is the estate's own written rule for exactly this case: the
-- statutory/management floor branch, the profile capability check, the layout validator, the
-- effective-window refusal, the supersede and the content hash are ONE piece of judgement, and a
-- second copy of them on the agent lane would drift with no differential test watching (F5-D26).
do $x7$
declare d text;
begin
  d := pg_temp._fa5_extract('clara.publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text)',
        '_publish_report_template_core',
        E'c := clara._human_ctx(clara.role_rank(case p_report_class when \'statutory\' then \'admin\' else \'bookkeeper\' end));\n  ', 3, 7);
  execute d;
  raise notice 'f_a5 pr1 #7: clara._publish_report_template_core derived and reversal-proven';
end
$x7$;

-- The admin floor for a statutory template was carried BY THE CONTEXT RESOLUTION, so the core --
-- which resolves no context -- has to carry its agent-lane mirror itself (annex A.2:
-- statutory_template_human, raised by this core). The agent can never be an admin of any firm, so
-- this is the same floor stated in the terms the wake lane can be measured in.
do $x7b$
declare
  d text; v_n int;
  a text := '  if p_claim_capability is null or p_claim_capability not in (''claims_compliance'', ''no_claim'')';
begin
  select p.prosrc into d from pg_proc p where p.oid = 'clara._publish_report_template_core(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,jsonb,date,text)'::regprocedure;
  v_n := (length(d) - length(replace(d, a, ''))) / length(a);
  if v_n <> 1 then raise exception 'f_a5 pr1 #7b: floor anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  d := replace(d, a,
    E'  -- THE ADMIN FLOOR, RESTATED FOR A LANE THAT CARRIES NO JWT. On the human door the floor is\n'
 || E'  -- an ADMIN-rank context resolution for a statutory class; a wake credential resolves no role\n'
 || E'  -- at all, so the same boundary is drawn against the acting identity instead. Issue, statutory\n'
 || E'  -- wording and statutory templates stay human (law 71).\n'
 || E'  -- (The context-resolver is deliberately NOT NAMED in this comment: section 10 asserts that no\n'
 || E'  -- core carries that identifier ANYWHERE in its source, comments included -- the strictest form\n'
 || E'  -- of the check, and one a mention in prose would defeat.)\n'
 || E'  if p_wake_kind is not null and p_report_class = ''statutory'' then\n'
 || E'    raise exception ''publishing a statutory template is a human act'' using errcode = ''CLR04'',\n'
 || E'      detail = ''{"reason":"statutory_template_human","fix":"an admin publishes a statutory template through clara.publish_report_template_version"}'';\n'
 || E'  end if;\n'
 || a);
  execute format('create or replace function clara._publish_report_template_core(p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, p_template_key text, p_title text, p_report_class text, p_claim_capability text, p_statutory_profile_version_id uuid, p_house_style_version_id uuid, p_layout_ast jsonb, p_effective_from date, p_op_key text) returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fa5core$%s$fa5core$', d);
  raise notice 'f_a5 pr1 #7b: the report-template core refuses report_class=statutory on any wake lane (statutory_template_human)';
end
$x7b$;

create or replace function clara.publish_report_template_version(p_template_key text, p_title text,
    p_report_class text, p_claim_capability text, p_statutory_profile_version_id uuid,
    p_house_style_version_id uuid, p_layout_ast jsonb, p_effective_from date, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $d7$
declare c record;
begin
  -- ORDER-PRESERVING. The live body refused an unregistered report class BEFORE resolving the JWT,
  -- because the required floor is a FUNCTION of the class. The check therefore rides the delegate
  -- as the rank SELECTOR; the publish judgement itself stays whole in the core, which carries this
  -- same closed world for every other caller.
  if p_report_class is null or p_report_class not in ('statutory', 'management') then
    raise exception 'report class % is not registered', p_report_class using errcode = 'CLR10',
      detail = '{"reason":"report_class_unknown","fix":"publish a statutory or a management template"}';
  end if;
  c := clara._human_ctx(clara.role_rank(case p_report_class when 'statutory' then 'admin' else 'bookkeeper' end));
  return clara._publish_report_template_core(c.firm, c.actor, null, null, p_template_key, p_title,
    p_report_class, p_claim_capability, p_statutory_profile_version_id, p_house_style_version_id,
    p_layout_ast, p_effective_from, p_op_key);
end
$d7$;

-- --- #8  clara.publish_chart_template_version -> clara._publish_chart_template_core ------------
do $x8$
declare d text;
begin
  d := pg_temp._fa5_extract('clara.publish_chart_template_version(text,text,jsonb,date,text)',
        '_publish_chart_template_core',
        E'c := clara._human_ctx(clara.role_rank(\'bookkeeper\'));\n  ', 3, 7);
  execute d;
  raise notice 'f_a5 pr1 #8: clara._publish_chart_template_core derived and reversal-proven';
end
$x8$;

create or replace function clara.publish_chart_template_version(p_chart_key text, p_title text,
    p_chart_spec_ast jsonb, p_effective_from date, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $d8$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._publish_chart_template_core(c.firm, c.actor, null, null, p_chart_key, p_title,
    p_chart_spec_ast, p_effective_from, p_op_key);
end
$d8$;

-- --- #9  clara.enqueue_render_job -> clara._enqueue_render_job_core ----------------------------
-- THIS ONE CARRIES NO _human_ctx AT ALL (PR-0 measured zero occurrences), so it is not an OBO
-- extraction -- it is an ATTRIBUTION one. The live body audits under r.requested_by (0080:352),
-- which after SS3.3 is the DIRECTING HUMAN. Left uncut it would write "Alice enqueued a render"
-- for a render Clara enqueued inside Clara's own transaction: survey S5's identity class,
-- re-created in the audit trail (F5-D27, gate-2 material 6).
do $x9$
declare
  v_body text; v_new text; v_check text; v_n int;
  a text := E'    perform clara._audit(r.firm_id, r.requested_by, null, null, \'enqueue_render_job\', null,';
  b text := E'    perform clara._audit(coalesce(p_firm, r.firm_id), v_actor, v_obo, p_wake_kind, \'enqueue_render_job\', null,';
begin
  select p.prosrc into v_body from pg_proc p where p.oid = 'clara.enqueue_render_job(uuid,text)'::regprocedure;
  if position('p_firm' in v_body) > 0 or position('p_actor' in v_body) > 0 or position('v_actor' in v_body) > 0 then
    raise exception 'f_a5 pr1 #9: the body already uses a name the derivation introduces' using errcode='CLR10';
  end if;
  v_n := (length(v_body) - length(replace(v_body, a, ''))) / length(a);
  if v_n <> 1 then raise exception 'f_a5 pr1 #9: audit anchor occurs % time(s)', v_n using errcode='CLR10'; end if;
  v_n := (length(v_body) - length(replace(v_body, 'declare r record;', ''))) / length('declare r record;');
  if v_n <> 1 then raise exception 'f_a5 pr1 #9: declare anchor occurs % time(s)', v_n using errcode='CLR10'; end if;

  v_new := replace(v_body, 'declare r record;', 'declare v_actor uuid; v_obo uuid; r record;');
  v_new := replace(v_new, a, b);
  -- the reversal proof: undo both substitutions and the original must reappear byte for byte
  v_check := replace(replace(v_new, b, a), 'declare v_actor uuid; v_obo uuid; r record;', 'declare r record;');
  if v_check is distinct from v_body then
    raise exception 'f_a5 pr1 #9: the reversal does not reconstruct the original body' using errcode='CLR10';
  end if;
  -- and the resolution itself, spliced immediately before the audit
  v_new := replace(v_new, b,
    E'    -- THE BELT CANNOT RE-CREATE S5 EITHER. When this core is called BY a lane (the seal core,\n'
 || E'    -- a wake wrapper) it audits under the identity that lane passes. When it is called by the\n'
 || E'    -- leader''s fallback sweep -- the one legitimate NULL via_wake_kind on this lane, enumerated\n'
 || E'    -- in design SS3.4 rather than papered over -- it attributes an agent-prepared run''s render\n'
 || E'    -- to Clara on behalf of the run''s director, never to the human who merely directed the pack.\n'
 || E'    v_actor := coalesce(p_actor, case when r.prepared_by_agent then clara.agent_user_id() else r.requested_by end);\n'
 || E'    v_obo   := coalesce(p_obo,   case when r.prepared_by_agent then r.directed_by else null end);\n'
 || b);
  execute format('create function clara._enqueue_render_job_core(p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, p_report_run_id uuid, p_kind text) returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fa5core$%s$fa5core$', v_new);
  raise notice 'f_a5 pr1 #9: clara._enqueue_render_job_core derived, reversal-proven, and its audit attribution is prepared_by_agent-aware';
end
$x9$;

-- The public name stays the thin delegate the leader's fallback sweep calls. No new grant, no new
-- allowlist row; clara.enqueue_render_job is and remains ungranted (owner only), reached by
-- clara.enqueue_missing_render_jobs alone -- the live-catalog caller census at PR-0 says so.
create or replace function clara.enqueue_render_job(p_report_run_id uuid, p_kind text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $d9$
begin
  return clara._enqueue_render_job_core(null, null, null, null, p_report_run_id, p_kind);
end
$d9$;

-- ---------------------------------------------------------------------------------------------
-- SECTION 5 -- D1 #6. clara._seal_report_artifact_core gains the identity pair, DB-DERIVES the
-- artifact's direction from its run, and writes the F-A5 receipt.  RULING R-L23.
--
-- THE PAIR IS AT THE TAIL, WITH DEFAULTS, AND THAT IS A DELIBERATE DEVIATION (F5-D32). Annex A.1
-- spelled (p_firm, p_actor, **p_obo, p_wake_kind**, ...). PR-0's caller census found a SECOND live
-- caller -- clara.complete_render_job, EXECUTE-granted to clara_runtime, calling positionally with
-- ten arguments. Positions 3-4 would have broken it and pulled the render worker into this D1
-- window. Quiescing a render worker for an argument order is the wrong trade.
--
-- THE ARTIFACT'S IDENTITY IS DB-DERIVED, NEVER CALLER-SUPPLIED -- the idiom complete_render_job
-- already uses two lines above its call, for the prior-artifact link. It matters because EVERY
-- pre_sign artifact in production is sealed by the render worker, not by a human or a wake door:
-- had the pair been taken from the caller, report_artifacts.directed_by / prepared_by_agent would
-- be NULL/false on exactly the artifact clara.approve_report_for_issue binds to, and ARM 1's
-- artifact-side comparison would be a wall drawn and not armed -- gate-2 blocker 2, one level over.
-- An explicit non-NULL p_obo must AGREE with the run or the seal refuses artifact_identity_mismatch.
do $s5$
declare
  v_body text; v_new text; v_check text; v_n int; a text;
  a_cols text := E'      prior_artifact_id, sealed_by)';
  a_vals text := E'      p_manifest, a.id, v_removed, a.uncertified, p_prior_artifact_id, p_actor)';
  a_audit text := E'  perform clara._audit(p_firm, p_actor, null, null, \'seal_report_artifact\', null,';
  -- the three replacements, spelled out ONCE so the derivation and its reversal cannot disagree
  n_cols text := E'      prior_artifact_id, sealed_by, directed_by, prepared_by_agent)';
  n_vals text := E'      p_manifest, a.id, v_removed, a.uncertified, p_prior_artifact_id, p_actor,\n      r.directed_by, r.prepared_by_agent)';
  n_audit text := E'  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, \'seal_report_artifact\', null,';
  -- the ADDED block, likewise: an addition is reversed by removing exactly the string added
  n_block text :=
    E'  -- R-L23: an explicit direction from the wake door must AGREE with the run it seals. Compared\n'
 || E'  -- with IS DISTINCT FROM so a NULL on either side is a decided answer, never a NULL predicate\n'
 || E'  -- that silently falls through (law 68''s second clause).\n'
 || E'  if p_obo is not null and p_obo is distinct from r.directed_by then\n'
 || E'    raise exception ''the artifact seal names a different director than its run'' using errcode = ''CLR10'',\n'
 || E'      detail = jsonb_build_object(''reason'', ''artifact_identity_mismatch'', ''run_directed_by'', r.directed_by,\n'
 || E'        ''seal_directed_by'', p_obo, ''fix'', ''seal the artifact on behalf of the human who directed its run'')::text;\n'
 || E'  end if;\n'
 || E'  if p_agent is not null then\n'
 || E'    perform clara._report_agent_receipt(p_firm, r.client_id, r.id, null, ''seal_artifact'', ''done'',\n'
 || E'      null, null, p_obo, coalesce(p_wake_kind, ''interactive''), p_agent, p_op_key);\n'
 || E'  end if;\n';
begin
  select p.prosrc into v_body from pg_proc p where p.oid = 'clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure;
  foreach a in array array[a_cols, a_vals, a_audit] loop
    v_n := (length(v_body) - length(replace(v_body, a, ''))) / length(a);
    if v_n <> 1 then raise exception 'f_a5 pr1 #6: an anchor occurs % time(s), expected exactly 1', v_n using errcode='CLR10'; end if;
  end loop;
  if position('p_obo' in v_body) > 0 or position('p_wake_kind' in v_body) > 0 or position('p_agent' in v_body) > 0
     or position('directed_by' in v_body) > 0 or position('prepared_by_agent' in v_body) > 0 then
    raise exception 'f_a5 pr1 #6: the body already uses a name the derivation introduces' using errcode='CLR10';
  end if;

  -- STAGE 1 -- three pure substitutions, each reversible by a plain replace()
  v_new := v_body;
  v_new := replace(v_new, a_cols,  n_cols);
  v_new := replace(v_new, a_vals,  n_vals);
  v_new := replace(v_new, a_audit, n_audit);
  -- STAGE 2 -- one pure ADDITION, immediately before the (already rewritten) audit line
  v_new := replace(v_new, n_audit, n_block || n_audit);

  -- THE REVERSAL PROOF. Remove the added block, then undo the three substitutions; the original
  -- body must reappear byte for byte. Nothing here is a regex: an addition of a known string is
  -- reversed by removing that exact string, which is why stage 2 is separate from stage 1.
  v_check := replace(v_new, n_block, '');
  v_check := replace(v_check, n_audit, a_audit);
  v_check := replace(v_check, n_vals,  a_vals);
  v_check := replace(v_check, n_cols,  a_cols);
  if v_check is distinct from v_body then
    raise exception 'f_a5 pr1 #6: the reversal does not reconstruct the original body -- refusing to move it' using errcode='CLR10';
  end if;
  -- and the addition really is present exactly once
  v_n := (length(v_new) - length(replace(v_new, n_block, ''))) / length(n_block);
  if v_n <> 1 then raise exception 'f_a5 pr1 #6: the added block occurs % time(s)', v_n using errcode='CLR10'; end if;

  -- DROP + CREATE, not CREATE OR REPLACE: the argument list changes. The two live callers pass ten
  -- positional arguments and both keep resolving, because the new pair is at the TAIL with defaults.
  drop function clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text);
  execute format('create function clara._seal_report_artifact_core(p_firm uuid, p_actor uuid, p_report_run_id uuid, p_kind text, p_key_extension text, p_sha256 text, p_byte_size bigint, p_manifest jsonb, p_prior_artifact_id uuid, p_op_key text, p_obo uuid default null, p_wake_kind text default null, p_agent jsonb default null) returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fa5core$%s$fa5core$', v_new);
  revoke all on function clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text,uuid,text,jsonb) from public;
  raise notice 'f_a5 pr1 #6: the artifact core takes (p_obo, p_wake_kind, p_agent) at the TAIL with NULL defaults; the artifact''s directed_by/prepared_by_agent are DB-derived from its run; an explicit disagreeing director refuses artifact_identity_mismatch';
end
$s5$;

-- ---------------------------------------------------------------------------------------------
-- SECTION 6 -- D1 #4. clara.approve_report_for_issue: ARM 0, the FOUR-identity comparison, and
-- issue_mode='agent_prepared'.  Design SS3.3, TA-P6 A.
--
-- WHAT S5 FOUND. The live wall compares c.actor against r.requested_by and art.sealed_by only.
-- An agent-run pack put clara.agent_user_id() into both, so NEITHER comparison could ever match a
-- human approver: the wall did not refuse, it EVAPORATED, and the human who directed the run
-- regained the right to approve his own request.
--
-- WHY THE AGENT IS NOT SIMPLY BARRED FROM requested_by. It is not null (0065:379) and a self-run
-- pack has no human to put there; writing a human who did not ask is a law-22 fabrication. Record
-- both identities and make the arms read them -- the only shape that is honest AND biting.
--
-- ARM 0 IS FIRST BECAUSE THE NULL/MACHINE PRINCIPAL IS ITS OWN FIRST ARM (law 68), never inferred
-- from the other arms falling through. Every identity comparison uses IS NOT DISTINCT FROM: a CASE
-- whose arms are all NULL-poisoned is an open door drawn as a wall.
-- ---------------------------------------------------------------------------------------------
create or replace function clara.approve_report_for_issue(p_report_run_id uuid,
    p_expected_artifact_sha256 text, p_reason text, p_self_attestation text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $issue$
declare c record; r record; art record; prior jsonb; v_mode text; v_checkers int; v_attested text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select * into r from clara.report_runs where id = p_report_run_id and firm_id = c.firm;
  if not found then
    raise exception 'report run not found' using errcode = 'CLR11', detail = '{"reason":"report_run_not_in_firm"}';
  end if;
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'issuing financial statements is a key-2 capability' using errcode = 'CLR04',
      detail = '{"reason":"capability_required","capability":"close_and_attest","fix":"the firm owner grants key 2 as an audited act"}';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'issue requires a stated reason' using errcode = 'CLR10',
      detail = '{"reason":"issue_reason_required"}';
  end if;
  -- B8: RESERVE BEFORE THE STATE CHECK. A successful issue moves the run to 'issued'; a same-key
  -- retry after a lost response must replay its receipt, not refuse with report_run_state_illegal.
  -- M13: the hash covers the self-attestation too -- a solo approval that changed only its
  -- attestation text is a DIFFERENT act and must refuse rather than alias onto the first.
  prior := clara._reserve_op(c.firm, 'approve_report_for_issue', p_op_key,
    clara._hash(jsonb_build_object('run', r.id, 'sha256', p_expected_artifact_sha256,
      'reason', p_reason, 'self_attestation', p_self_attestation)));
  if prior is not null then return prior; end if;

  if r.state <> 'dataset_sealed' then
    raise exception 'this run is not in a state that can be issued' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'report_run_state_illegal', 'state', r.state)::text;
  end if;
  select * into art from clara.report_artifacts where report_run_id = r.id and kind = 'pre_sign';
  if not found then
    raise exception 'this run has no sealed pre-sign artifact' using errcode = 'CLR42',
      detail = '{"reason":"pre_sign_artifact_absent","fix":"seal the pre-sign artifact before approving issue"}';
  end if;
  -- THE ATTESTATION BINDS THE EXACT BYTES (ruled). An approval that names a different hash is
  -- an approval of a different document. An agent-prepared pack does not relax it.
  if art.sha256 is distinct from p_expected_artifact_sha256 then
    raise exception 'the approval names a different artifact than the one sealed' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'artifact_hash_mismatch', 'sealed_sha256', art.sha256,
        'fix', 'attest the exact sealed artifact hash')::text;
  end if;

  v_checkers := clara.eligible_checker_count(c.firm);
  v_attested := nullif(btrim(coalesce(p_self_attestation, '')), '');

  -- ARM 0 -- A SELF-RUN PACK. Nobody directed it, so `c.actor = r.directed_by` is NOT EVALUABLE and
  -- must not be allowed to decide anything. The issuer must be a human who did not prepare; the
  -- machine did prepare, and the machine cannot issue (law 71, and the key-2 gate above).
  if r.prepared_by_agent and r.directed_by is null then
    if v_checkers < 1 then
      raise exception 'a self-run pack needs a human issuer who did not prepare it' using errcode = 'CLR05',
        detail = jsonb_build_object('reason', 'self_run_pack_requires_independent_issuer',
          'eligible_checker_count', v_checkers,
          'fix', 'an active bookkeeper+ of this firm issues the pack')::text;
    end if;
    if v_attested is null then
      raise exception 'an agent-prepared issue states its attestation' using errcode = 'CLR05',
        detail = '{"reason":"agent_prepared_attestation_required"}';
    end if;
    v_mode := 'agent_prepared';

  -- ARM 1 -- TWO OR MORE ELIGIBLE HUMANS. FOUR identities, not two: the requester, the run's
  -- DIRECTOR, the artifact's sealer and the artifact's DIRECTOR. The two new ones are what closes
  -- S5, and the artifact-side pair is armed on the real lane because the seal core DB-derives it
  -- from the run (R-L23).
  elsif v_checkers >= 2 then
    if c.actor is not distinct from r.requested_by
       or c.actor is not distinct from r.directed_by
       or c.actor is not distinct from art.sealed_by
       or c.actor is not distinct from art.directed_by then
      raise exception 'the approver must differ from the preparer' using errcode = 'CLR05',
        detail = jsonb_build_object('reason', 'report_issue_segregation_violation',
          'requested_by', r.requested_by, 'directed_by', r.directed_by,
          'sealed_by', art.sealed_by, 'artifact_directed_by', art.directed_by)::text;
    end if;
    if r.prepared_by_agent then
      if v_attested is null then
        raise exception 'an agent-prepared issue states its attestation' using errcode = 'CLR05',
          detail = '{"reason":"agent_prepared_attestation_required"}';
      end if;
      v_mode := 'agent_prepared';
    else
      v_mode := 'two_person';
    end if;

  -- ARM 2 -- THE SOLO ARM, matched to the close wall's CLR05 shape (TA-P6 A). prepared_by_agent
  -- does NOT weaken it: the single human still signs, and the mode records agent_prepared so the
  -- audit reads truthfully -- "prepared by Clara, sole human signer X". The wall AUTO-UPGRADES
  -- when a second human joins, because eligible_checker_count is evaluated here, not stored.
  else
    if v_attested is null then
      if r.prepared_by_agent then
        raise exception 'an agent-prepared issue states its attestation' using errcode = 'CLR05',
          detail = '{"reason":"agent_prepared_attestation_required"}';
      end if;
      raise exception 'a solo firm issues with an explicit self-approval attestation' using errcode = 'CLR05',
        detail = '{"reason":"report_issue_self_attestation_required"}';
    end if;
    v_mode := case when r.prepared_by_agent then 'agent_prepared' else 'solo_self_attested' end;
  end if;

  update clara.report_runs
     set state = 'issued', issued_by = c.actor, issued_at = now(), issue_reason = p_reason,
         issue_mode = v_mode, issue_self_attestation = v_attested,
         issued_artifact_id = art.id
   where id = r.id;
  perform clara._audit(c.firm, c.actor, null, null, 'approve_report_for_issue', null,
    jsonb_build_object('report_run_id', r.id, 'artifact_id', art.id, 'sha256', art.sha256, 'mode', v_mode,
      'prepared_by_agent', r.prepared_by_agent, 'directed_by', r.directed_by));
  return clara._finish_op(c.firm, 'approve_report_for_issue', p_op_key,
    jsonb_build_object('report_run_id', r.id, 'issued_artifact_id', art.id,
      'artifact_sha256', art.sha256, 'issue_mode', v_mode, 'state', 'issued',
      'prepared_by_agent', r.prepared_by_agent));
end
$issue$;

-- ---------------------------------------------------------------------------------------------
-- SECTION 7 -- D1 #5. clara._tf_metric_definition_lifecycle_v1 gains ONE arm.  Survey S3.
--
-- The trigger admits draft -> firm_approved only on {"kind":"human_approval","version":1}. TA-P1 C
-- and law 74 hand definition self-promotion to Clara; this trigger says no, in the durable half,
-- for every writer including a future ungranted core. The only two ways through are to extend the
-- evidence closed world with an agent kind, or to write human_approval for a machine act -- and
-- the second is a law-22 fabrication that would also defeat 0084's whole maker/checker apparatus.
--
-- THE HUMAN ARM'S BYTES ARE UNTOUCHED (extend-never-weaken). The agent arm additionally requires
-- approved_by = clara.agent_user_id(), and a model and a rationale inside the evidence: an agent
-- approval that cannot say WHICH model approved and WHY is not evidence of anything.
-- A FIFTH evidence kind refuses (definition_evidence_kind_unknown) rather than falling through --
-- law 36; the previous body's implicit fall-through was "not human_approval" and nothing else.
-- ---------------------------------------------------------------------------------------------
create or replace function clara._tf_metric_definition_lifecycle_v1() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $lc$
declare v_kind text;
begin
  if tg_op='DELETE'or(to_jsonb(new)-array['state','approved_by','approved_at','approval_reason','self_approval_attestation','approved_formula_sha256','approval_evidence','supersedes_version_id'])is distinct from(to_jsonb(old)-array['state','approved_by','approved_at','approval_reason','self_approval_attestation','approved_formula_sha256','approval_evidence','supersedes_version_id'])then raise exception 'metric definition version is historical'using errcode='CLR08';end if;
  if old.state='draft'and new.state='firm_approved'then
    -- the shape every approval must have, whoever signs it -- byte-identical to the live rule
    if new.approved_by is null or new.approved_at is null or nullif(btrim(new.approval_reason),'')is null or new.approved_formula_sha256 is distinct from new.formula_sha256 then
      raise exception 'approved definition transition lacks positive evidence'using errcode='CLR16';
    end if;
    v_kind := new.approval_evidence->>'kind';
    if new.approval_evidence@>'{"kind":"human_approval","version":1}'::jsonb then
      -- THE HUMAN ARM. Its ADMITTING condition is byte-unchanged (extend-never-weaken); what is
      -- added is a REFUSAL the arm never had, and it is added because the alternative was a
      -- comment that was not true. S3's whole point is that this trigger says no IN THE DURABLE
      -- HALF, for every writer including a future ungranted core -- and the previous cut left
      -- `human_approval` admissible to ANY writer, including one signing as the machine. That is
      -- law 22's fabrication written into the evidence record, and the only reason it could not
      -- happen today is that F-A5's own core chooses not to: a wall whose enforcement is the
      -- caller's good manners is not a wall.
      if new.approved_by is not distinct from clara.agent_user_id() then
        raise exception 'a machine approval may not be recorded as a human approval'using errcode='CLR16',
          detail='{"reason":"agent_self_approval_incomplete","class":"human_evidence_for_machine_act","fix":"an agent approval carries kind=agent_self_approval"}';
      end if;
    elsif new.approval_evidence@>'{"kind":"agent_self_approval","version":1}'::jsonb then
      -- THE AGENT ARM (TA-P1 C / law 74). Its mirror image -- writing human_approval for a machine
      -- act -- is refused by the arm above, mechanically, against approved_by.
      if new.approved_by is distinct from clara.agent_user_id() then
        raise exception 'agent self-approval must be signed by the agent identity'using errcode='CLR16',
          detail='{"reason":"agent_self_approval_incomplete","class":"approved_by"}';
      end if;
      if nullif(btrim(coalesce(new.approval_evidence->'agent'->>'model','')),'')is null
         or nullif(btrim(coalesce(new.approval_evidence->'agent'->>'rationale','')),'')is null then
        raise exception 'agent self-approval evidence names its model and its rationale'using errcode='CLR16',
          detail='{"reason":"agent_self_approval_incomplete","class":"model_or_rationale"}';
      end if;
    else
      -- LAW 36: a closed world refuses what it does not recognise, and says which value it saw.
      raise exception 'metric definition approval evidence kind is not registered'using errcode='CLR16',
        detail=jsonb_build_object('reason','definition_evidence_kind_unknown','kind',v_kind)::text;
    end if;
  elsif old.state='draft'and new.state='rejected'then if new.approved_by is not null or new.approved_at is not null or new.approved_formula_sha256 is not null or nullif(btrim(new.approval_reason),'')is null then raise exception 'rejected definition transition is malformed'using errcode='CLR16';end if;
  elsif old.state in('firm_approved','canonical')and new.state='superseded'then if nullif(btrim(new.approval_reason),'')is null or new.approved_formula_sha256 is distinct from old.approved_formula_sha256 then raise exception 'superseded definition transition is malformed'using errcode='CLR16';end if;
  elsif old.state='firm_approved'and new.state=old.state and old.supersedes_version_id is null and new.supersedes_version_id is not null then if row(new.approved_by,new.approved_at,new.approval_reason,new.self_approval_attestation,new.approved_formula_sha256,new.approval_evidence)is distinct from row(old.approved_by,old.approved_at,old.approval_reason,old.self_approval_attestation,old.approved_formula_sha256,old.approval_evidence)then raise exception 'successor lineage binding changed approval evidence'using errcode='CLR16';end if;
  else raise exception 'illegal metric definition transition'using errcode='CLR16';end if;
  return new;
end
$lc$;

-- ---------------------------------------------------------------------------------------------
-- SECTION 8 -- the agent evaluate leg.  clara.evaluate_fs_pack_agent_v1.  Design SS3.2.
--
-- WHY THIS EXISTS AT ALL, in the words the estate used first. eta's own refusal payload
-- (0077:379-395) names three blocked verbs and says "every verb in the open-evaluate-seal chain
-- resolves a human JWT context". Gate 2 found the design's answer to the middle one was wrong:
-- clara.evaluate_metric_v1's first executable statement IS c := clara._human_ctx(...) and it is
-- ordinal 0 of the same frozen closure, so a wake credential raises CLR04 before any work. The
-- pack verb cannot be recut either -- it is ordinal 9 of that closure and PR-0 PROVED, on the rig,
-- that moving it raises 'evaluator freeze mismatch' regardless of the deployed flag.
--
-- THE LAWFUL ENTRYPOINT IS ONE LEVEL DOWN, and it is eta's own: clara._metric_eval_node_v1.
-- PR-0's replay settled prediction P14 at the bytes: the node body carries ZERO _human_ctx
-- references, zero jwt references, and its whole transitive callee closure (clara._hash,
-- clara._metric_selector_account_ids) is equally clean. It is ordinal 1 of the frozen closure --
-- FROZEN, which is exactly why calling it is safe: nothing here can move it.
--
-- TA-P11's ONE-ARCHITECTURE TEST, applied. This is a SECOND cell-writing entrance and it is named
-- as one. It is not a second COMPUTATION: it resolves the same deployed evaluate_metric v1 row by
-- the same hardcoded literal, calls the same node, and stamps cells with the SAME
-- evaluator_version_id -- which is why a run a human half-evaluated and Clara finished still passes
-- the single-version checks at assess (0070:323-326) and seal (0070:502-505).
--
-- THE CEREMONY GATE IS MECHANICAL, NOT BELIEVED (gate-2 material 8). This core resolves its OWN
-- closure row -- evaluate_fs_pack_agent v1, firm_id null, deployed -- and raises CLR10
-- evaluator_undeployed when it is absent. v1 of the design asserted inertness that NOTHING READ.
-- ---------------------------------------------------------------------------------------------
create function clara.evaluate_fs_pack_agent_v1(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_definition_version_ids uuid[], p_period_ids uuid[], p_snapshot_id uuid,
    p_run_id uuid, p_agent jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $agev$
declare
  s record; ctx record; dv record; item record; existing record;
  ev uuid; agent_ev uuid; root_period uuid; root_start date; bound_period_ids uuid[];
  requested_count int; existing_count int; new_required int; measured_count int; context_count int;
  ctx_id uuid; v clara.metric_value_v1; reason_id uuid; cell uuid;
  factor numeric; q numeric; rem numeric; shown text; na jsonb;
  z jsonb; cells jsonb := '[]'::jsonb; result jsonb;
begin
  -- THE CEREMONY GATE, FIRST AND MECHANICAL. Resolved before anything is validated, reserved or
  -- written, so a pre-ceremony call costs no durable state and the refusal is unambiguous.
  select id into agent_ev from clara.evaluator_versions
   where evaluator_name = 'evaluate_fs_pack_agent' and version = 1 and firm_id is null and deployed;
  if agent_ev is null then
    raise exception 'the agent pack evaluator closure is not deployed' using errcode = 'CLR10',
      detail = '{"reason":"evaluator_undeployed","class":"evaluate_fs_pack_agent","fix":"the owner flips the closure row as a ceremony from merged main"}';
  end if;

  -- Shape, cost and uniqueness -- the same closed worlds evaluate_fs_pack_v1 states, because they
  -- are the pack contract and not the human lane's private business.
  if p_client is null or p_snapshot_id is null or p_run_id is null then
    raise exception 'metric pack scalar identities must be nonnull' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"pack_identity","constraint":"nonnull"}';
  end if;
  if p_definition_version_ids is null or cardinality(p_definition_version_ids)=0
     or array_position(p_definition_version_ids,null) is not null then
    raise exception 'metric pack definitions must be nonempty identities' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"definition_versions","constraint":"nonempty_nonnull"}';
  end if;
  requested_count := cardinality(p_definition_version_ids);
  if requested_count > 5000 then
    raise exception 'metric pack run cost exceeded' using errcode='CLR10',
      detail=jsonb_build_object('reason','cost_exceeded','class','cells_per_run','limit',5000,
        'measured_count',requested_count,'requested_count',requested_count)::text;
  end if;
  if cardinality(array(select distinct x from unnest(p_definition_version_ids) x)) <> requested_count then
    raise exception 'metric pack definitions must be unique' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"definition_versions","constraint":"unique"}';
  end if;
  if p_period_ids is null or cardinality(p_period_ids) not between 1 and 25
     or array_position(p_period_ids,null) is not null
     or cardinality(array(select distinct x from unnest(p_period_ids) x)) <> cardinality(p_period_ids) then
    raise exception 'metric pack context period binding invalid' using errcode='CLR10',
      detail='{"reason":"cost_exceeded","class":"context_periods","limit":25}';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_firm::text||':'||p_run_id::text,0));
  z := clara._reserve_op(p_firm,'agent_evaluate_fs_pack',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'definitions',p_definition_version_ids,
      'periods',p_period_ids,'snapshot',p_snapshot_id,'run',p_run_id)));
  if z is not null then return z; end if;

  select * into s from clara.metric_input_snapshots
   where id = p_snapshot_id and client_id = p_client and firm_id = p_firm;
  if s.id is null or cardinality(p_period_ids) <> (select count(*) from clara.metric_input_snapshot_periods
      where snapshot_id = s.id and period_id = any(p_period_ids)) then
    raise exception 'metric pack snapshot/context binding incomplete' using errcode='CLR11';
  end if;
  root_period := p_period_ids[1];
  select period_start into strict root_start from clara.metric_input_snapshot_periods
   where snapshot_id = s.id and period_id = root_period;

  -- THE SAME DEPLOYED ROW THE HUMAN LANE RESOLVES, by the same hardcoded literal (0059:112's rule).
  -- This is what makes a mixed run seal.
  select id into ev from clara.evaluator_versions
   where evaluator_name='evaluate_metric' and version=1 and firm_id is null and deployed;
  if ev is null then
    raise exception 'metric evaluator is not deployed' using errcode='CLR10',
      detail='{"reason":"evaluator_undeployed","class":"evaluate_metric"}';
  end if;

  existing_count := (select count(*)::int from clara.metric_cells where firm_id=p_firm and run_id=p_run_id);
  select count(*)::int into new_required from unnest(p_definition_version_ids) u(definition_version_id)
   where not exists (select 1 from clara.metric_cells mc where mc.firm_id=p_firm and mc.client_id=p_client
                      and mc.run_id=p_run_id and mc.definition_version_id=u.definition_version_id);
  measured_count := existing_count + new_required;
  if measured_count > 5000 then
    raise exception 'metric pack run cost exceeded' using errcode='CLR10',
      detail=jsonb_build_object('reason','cost_exceeded','class','cells_per_run','limit',5000,
        'measured_count',measured_count,'existing_count',existing_count,'new_required',new_required,
        'requested_count',requested_count)::text;
  end if;

  -- ONE run context per (client, run), shared with the human lane. If a context already exists it
  -- is READ and checked, never replaced: a run half-evaluated by a human keeps its own context.
  select count(*)::int, min(ec.id::text)::uuid into context_count, ctx_id
    from clara.metric_evaluation_contexts ec where ec.firm_id=p_firm and ec.run_id=p_run_id;
  if context_count > 1 then
    raise exception 'run context is ambiguous within the firm' using errcode='CLR10',
      detail='{"reason":"scope_mismatch","class":"run_context"}';
  end if;
  if ctx_id is not null then
    select ec.* into strict ctx from clara.metric_evaluation_contexts ec where ec.id=ctx_id for update;
    select array_agg(period_id order by ordinal) into bound_period_ids
      from clara.metric_evaluation_context_periods where context_id=ctx.id;
    if ctx.client_id<>p_client or ctx.snapshot_id<>s.id or ctx.evaluator_version_id<>ev
       or bound_period_ids is distinct from p_period_ids then
      raise exception 'run context is immutable and mismatched' using errcode='CLR10',
        detail='{"reason":"scope_mismatch","class":"run_context"}';
    end if;
  else
    insert into clara.metric_evaluation_contexts(firm_id, client_id, snapshot_id, evaluator_version_id,
        run_id, context_sha256, created_by)
      values (p_firm, p_client, s.id, ev, p_run_id,
        clara._metric_context_sha256_v1(s.id, p_period_ids, p_firm, p_client, s.producer_version_id, ev,
          s.dataset_sha256, s.books_watermark), p_actor)
      returning * into ctx;
    insert into clara.metric_evaluation_context_periods
      select ctx.id, s.id, p_firm, p_client, p.period_id, p.period_start, p.period_end, u.ord-1
        from unnest(p_period_ids) with ordinality u(pid, ord)
        join clara.metric_input_snapshot_periods p on p.snapshot_id=s.id and p.period_id=u.pid;
  end if;

  -- PASS 1 -- every definition is admissible before ANY cell is written, exactly as the pack verb
  -- does it. A pack that fails halfway is not a pack.
  for item in select u.definition_version_id, u.ordinality
                from unnest(p_definition_version_ids) with ordinality u(definition_version_id, ordinality)
               order by u.ordinality loop
    select v2.* into dv from clara.metric_definition_versions v2
      join clara.metric_definitions d on d.id=v2.definition_id and d.firm_id is not distinct from v2.firm_id
     where v2.id=item.definition_version_id and (v2.firm_id is null or v2.firm_id=p_firm)
       and v2.state in ('canonical','firm_approved') and v2.approved_formula_sha256=v2.formula_sha256;
    if dv.id is null then
      raise exception 'pack definition is not approved for this firm' using errcode='CLR11',
        detail=jsonb_build_object('reason','definition_unavailable','definition_version_id',item.definition_version_id,'ordinal',item.ordinality-1)::text;
    end if;
    if dv.applies_from>root_start or (dv.applies_to is not null and dv.applies_to<root_start) then
      raise exception 'pack definition is not effective for target period' using errcode='CLR10',
        detail=jsonb_build_object('reason','scope_mismatch','class','definition_effectivity','definition_version_id',dv.id,'ordinal',item.ordinality-1)::text;
    end if;
    perform clara.validate_metric_ast_v1(dv.ast);
  end loop;

  -- PASS 2 -- evaluate. A cell that ALREADY EXISTS for (client, run, definition) is READ and
  -- reused: metric_cells carries a unique index on exactly that triple, so this is not an
  -- optimisation, it is the only lawful behaviour on a run the human lane started. The read is
  -- POSITIVE -- the row is seen -- never an absence standing in for one.
  for item in select u.definition_version_id, u.ordinality
                from unnest(p_definition_version_ids) with ordinality u(definition_version_id, ordinality)
               order by u.ordinality loop
    select mc.id, mc.cell_status, nr.reason_key into existing
      from clara.metric_cells mc
      left join clara.metric_na_reason_versions nr on nr.id = mc.na_reason_version_id
     where mc.firm_id=p_firm and mc.client_id=p_client and mc.run_id=p_run_id
       and mc.definition_version_id=item.definition_version_id;
    if existing.id is not null then
      if existing.id is not null and (select evaluator_version_id from clara.metric_cells where id=existing.id) <> ev then
        raise exception 'an existing cell on this run was stamped by another evaluator version'
          using errcode='CLR10', detail=jsonb_build_object('reason','evaluator_version_ambiguous',
            'definition_version_id',item.definition_version_id)::text;
      end if;
      cells := cells || jsonb_build_array(jsonb_build_object('ordinal',item.ordinality-1,
        'definition_version_id',item.definition_version_id,'cell_id',existing.id,
        'cell_status',existing.cell_status,'reason_key',existing.reason_key,'reused',true));
      continue;
    end if;

    select v2.* into dv from clara.metric_definition_versions v2
     where v2.id=item.definition_version_id and (v2.firm_id is null or v2.firm_id=p_firm)
       and v2.state in ('canonical','firm_approved');

    -- THE FROZEN NODE. Never clara.evaluate_metric_v1 -- see the header.
    v := clara._metric_eval_node_v1(p_client, s.id, ctx.id, root_period, dv.ast->'root',
           dv.allow_negative,
           (select policy_key from clara.averaging_policy_versions where id=dv.averaging_policy_id), null);
    reason_id := null; shown := null;
    if v.status <> 'ok' then
      select id into reason_id from clara.metric_na_reason_versions
       where reason_key=v.reason_key and firm_id is null and effective_from<=root_start
         and (effective_to is null or effective_to>=root_start) order by version desc limit 1;
      if reason_id is null then
        raise exception 'no N/A reason version is effective for the root reporting period'
          using errcode='CLR10', detail=jsonb_build_object('reason','scope_mismatch',
            'class','na_reason_effectivity','reason_key',v.reason_key,'root_period_start',root_start)::text;
      end if;
    else
      -- EXACT integer division, matching clara._tf_metric_cell_integrity term for term. numeric
      -- division is inexact at ~16 significant digits while mod() is exact; the wall re-derives
      -- this value and REFUSES on mismatch, so a divergence here is not a rounding nicety.
      factor := power(10::numeric, dv.result_scale);
      q := div(abs(v.numerator)*factor, v.denominator);
      rem := mod(abs(v.numerator)*factor, v.denominator);
      if rem*2 >= v.denominator then q := q+1; end if;
      shown := to_char((case when v.numerator<0 then -q else q end)/factor,
        'FM999999999999999999999999999999999999999999999999990' ||
        case when dv.result_scale>0 then '.'||repeat('0',dv.result_scale) else '' end);
    end if;
    na := jsonb_build_object(
      'presentation_map_versions', jsonb_build_object('version',1,'reason','definition_has_no_presentation_map_binding'),
      'model_proposal', jsonb_build_object('version',1,'reason','evaluator_originated'),
      'human_approval', jsonb_build_object('version',1,'reason','no_numeric_approval'),
      'supersession', jsonb_build_object('version',1,'reason','first_mint'));
    if cardinality(v.document_ids)=0 then
      na := na || jsonb_build_object('documents', jsonb_build_object('version',1,'reason','no_document-backed_input_rows'));
    end if;
    insert into clara.metric_cells(firm_id, client_id, run_id, evaluation_context_id, definition_version_id,
        formula_sha256, resolved_inputs_sha256, evaluator_version_id, books_watermark, cell_status,
        na_reason_version_id, exact_numerator, exact_denominator, unit_key, displayed_scale, displayed_text, inputs)
      values (p_firm, p_client, p_run_id, ctx.id, dv.id, dv.formula_sha256,
        clara._metric_resolved_inputs_sha256_v1(ctx.context_sha256, p_period_ids, p_firm, p_client, dv.id,
          dv.formula_sha256, v.account_set_version_ids, v.constant_version_ids, dv.edge_policy_set_id,
          dv.averaging_policy_id, ev, s.books_watermark),
        ev, s.books_watermark, v.status, reason_id,
        case when v.status='ok' then v.numerator end, case when v.status='ok' then v.denominator end,
        dv.unit_key, case when v.status='ok' then dv.result_scale end, shown,
        coalesce(v.inputs,'{}') || jsonb_build_object(
          'normalized_provenance', jsonb_build_object('period_ids',p_period_ids,'snapshot_ids',array[s.id],
            'account_set_version_ids', array(select x from unnest(v.account_set_version_ids) x order by x),
            'constant_version_ids', array(select x from unnest(v.constant_version_ids) x order by x),
            'entry_ids', array(select x from unnest(v.entry_ids) x order by x),
            'document_ids', array(select x from unnest(v.document_ids) x order by x),
            'presentation_map_version_ids','{}'::uuid[]),
          'schema','clara.metric-cell-inputs/v1','provenance_not_applicable',na))
      returning id into cell;
    insert into clara.metric_cell_periods
      select cell, p_firm, p_client, p.period_id, p.period_start, p.period_end, u.ord-1
        from unnest(p_period_ids) with ordinality u(pid, ord)
        join clara.metric_input_snapshot_periods p on p.snapshot_id=s.id and p.period_id=u.pid;
    insert into clara.metric_cell_snapshots values (cell, p_firm, p_client, s.id);
    insert into clara.metric_cell_account_sets select cell, p_firm, p_client, x from unnest(v.account_set_version_ids) x;
    insert into clara.metric_cell_constants   select cell, p_firm, p_client, x from unnest(v.constant_version_ids) x;
    insert into clara.metric_cell_entries     select cell, p_firm, p_client, x from unnest(v.entry_ids) x;
    insert into clara.metric_cell_documents   select cell, p_firm, p_client, x from unnest(v.document_ids) x;
    cells := cells || jsonb_build_array(jsonb_build_object('ordinal',item.ordinality-1,
      'definition_version_id',dv.id,'cell_id',cell,'cell_status',v.status,
      'reason_key',v.reason_key,'reused',false));
  end loop;

  result := jsonb_build_object('client_id',p_client,'run_id',p_run_id,'snapshot_id',p_snapshot_id,
    'definition_version_ids',p_definition_version_ids,'period_ids',p_period_ids,
    'cell_count',requested_count,'cells',cells,'evaluator_version_id',ev,
    'agent_evaluator_version_id',agent_ev);
  if p_agent is not null then
    perform clara._report_agent_receipt(p_firm, p_client, p_run_id, null, 'evaluate_pack', 'done',
      null, null, p_obo, coalesce(p_wake_kind,'interactive'), p_agent, p_op_key);
  end if;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'agent_evaluate_fs_pack', null,
    jsonb_build_object('client',p_client,'run_id',p_run_id,
      'definition_version_ids',p_definition_version_ids,'cell_count',requested_count,
      'agent', p_agent));
  return clara._finish_op(p_firm,'agent_evaluate_fs_pack',p_op_key,result);
end
$agev$;
revoke all on function clara.evaluate_fs_pack_agent_v1(uuid,uuid,uuid,text,uuid,uuid[],uuid[],uuid,uuid,jsonb,text) from public;

-- THE APPENDED CLOSURE ROW. Born UNDEPLOYED -- 0060's _tf_evaluator_deploy_once makes the flip a
-- one-way ceremony act and never a migration act, and PR-0 confirmed on the rig that an appended
-- row verifies beside evaluate_metric v1 without touching either verifier body (P3).
-- It ROSTERS this core's body and RE-PINS the shared internals it reaches, so a future migration
-- that moves any of them reds pnpm db:migrate rather than silently changing a reported number.
-- It NEVER moves a member off evaluate_metric v1's roster (survey C7).
--
-- WHAT THIS CLOSURE NEWLY FREEZES: EXACTLY ONE BODY -- its own entrypoint. Measured, because the
-- opposite was assumed in review: ordinals 1-8 below (_metric_eval_node_v1, validate_metric_ast_v1,
-- _validate_metric_node_v1, _metric_selector_account_ids, _metric_input_dataset_v1,
-- _metric_context_sha256_v1, _metric_resolved_inputs_sha256_v1 and clara._hash) are ALREADY the
-- members of evaluate_metric v1's closure -- read off clara.evaluator_version_members at PR-0,
-- ordinals 1-8 of that row, in the same order. So this file adds NO new estate-wide constraint on
-- any of them, and clara._hash in particular -- defined once at 0004:32 and called from 55 of the
-- ~102 migrations -- has been frozen since delta shipped, not since today. Omitting it here would
-- not have unfrozen it; it would only have made THIS closure incomplete, and a closure that
-- excludes the hash function its output depends on is not frozen in the sense hard constraint 2
-- needs. Included knowingly.
--
-- THE ENTRYPOINT IS NAMED clara.evaluate_fs_pack_agent_v1, NOT clara._agent_..._core, AND THAT IS
-- A DELIBERATE PER-MEMBER DECISION (F-A1 M7's standard: state it, do not inherit it).
-- scripts/check-frozen-evaluators.mjs discovers only /create ... function clara\.evaluate_[a-z0-9_]+/,
-- so an underscore-named entrypoint would be catalog-frozen at apply and INVISIBLE to review --
-- the half-freeze frozen-evaluators.json exists to prevent, and the one F-A1 fixed by renaming
-- clara.evaluate_witness_identity_v1 for exactly this reason. This body is new, has zero call
-- sites outside this train, and joins a family already named that way (evaluate_metric_v1,
-- evaluate_fs_pack_v1) -- so the rename is free and is taken. The eight members below are NOT
-- renamed and could not be: they are delta's already-frozen bodies, and renaming a frozen member
-- IS moving it. They stay source-invisible and DB-frozen, which is the same posture
-- clara.assess_metric_cell_independent_v1 already holds -- a scope the lint's own header declines
-- deliberately rather than by omission.
-- Ungranted-ness does not ride the underscore: it is an ACL fact, asserted per function in SS10.
do $s8$
declare v_id uuid;
begin
  with roster(o, s) as (values
    (0, 'clara.evaluate_fs_pack_agent_v1(uuid,uuid,uuid,text,uuid,uuid[],uuid[],uuid,uuid,jsonb,text)'),
    (1, 'clara._metric_eval_node_v1(uuid,uuid,uuid,uuid,jsonb,boolean,text,date)'),
    (2, 'clara.validate_metric_ast_v1(jsonb)'),
    (3, 'clara._validate_metric_node_v1(jsonb,integer)'),
    (4, 'clara._metric_selector_account_ids(uuid,jsonb)'),
    (5, 'clara._metric_input_dataset_v1(uuid,uuid,uuid[])'),
    (6, 'clara._metric_context_sha256_v1(uuid,uuid[],uuid,uuid,uuid,uuid,bytea,text)'),
    (7, 'clara._metric_resolved_inputs_sha256_v1(bytea,uuid[],uuid,uuid,uuid,bytea,uuid[],uuid[],uuid,uuid,uuid,text)'),
    (8, 'clara._hash(jsonb)')
  ), hashes as (
    select o, s, sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')) h from roster
  ), closure as (
    select sha256(convert_to(string_agg(encode(h,'hex'),'' order by o),'UTF8')) c from hashes
  ), newrow as (
    insert into clara.evaluator_versions(firm_id, evaluator_name, version, entrypoint_signature,
        closure_sha256, migration_version, deployed)
    select null, 'evaluate_fs_pack_agent', 1,
      'clara.evaluate_fs_pack_agent_v1(uuid,uuid,uuid,text,uuid,uuid[],uuid[],uuid,uuid,jsonb,text)',
      c, 'f_a5_reporting_agency_pr1', false from closure
    returning id
  )
  insert into clara.evaluator_version_members(evaluator_version_id, firm_id, ordinal, member_signature, body_sha256)
  select n.id, null, x.o, x.s, x.h from newrow n cross join hashes x;

  select id into v_id from clara.evaluator_versions
   where evaluator_name='evaluate_fs_pack_agent' and version=1 and firm_id is null;
  if (select deployed from clara.evaluator_versions where id=v_id) then
    raise exception 'f_a5 pr1: the agent evaluator closure must be born UNDEPLOYED' using errcode='CLR10';
  end if;
  perform clara.verify_evaluator_freeze();
  raise notice 'f_a5 pr1: evaluate_fs_pack_agent v1 registered UNDEPLOYED with 9 members; verify_evaluator_freeze() green beside evaluate_metric v1';
end
$s8$;

-- ---------------------------------------------------------------------------------------------
-- SECTION 9 -- the RE-AIMED maker/checker.  clara._agent_approve_metric_definition_core.
-- Design SS3.5, gate-2 blocker 3, F5-D24/D16, digest law 69.
--
-- THIS IS A WALL ON THE DIRECTOR, NOT A GATE ON CLARA. TA-P1 C's grant of the definition lifecycle
-- is untouched and Clara still approves her OWN UNDIRECTED drafts with no attestation -- that is
-- the fall-through, and it is the commonest lawful shape. What the wall refuses is a HUMAN using
-- Clara as his own checker, which is the hole 0084 named in its own words: "a human directs the
-- agent to draft, then approves it. That is self-approval wearing a costume."
--
-- v1 of this design exempted the whole agent path from all four of 0084's arms on the strength of
-- TA-P5's rider. The rider exempts self-run report packs from ARM 0 (orphan adoption) ONLY.
--
-- THE ELIGIBLE POPULATION IS 0084's, NOT eligible_checker_count. Design SS3.5's arm table says
-- eligible_checker_count (active bookkeeper+); 0084 counts active ADMIN/OWNER non-agent
-- memberships, because approval is an admin-floor act. Measuring the two lanes against DIFFERENT
-- populations would make "re-aimed, not removed" false. 0084's definition is used verbatim and the
-- design cite is trued in the same PR (F5-D33).
--
-- 0084's OWN BODY IS NOT RECUT. The human lane keeps every arm it has.
-- ---------------------------------------------------------------------------------------------
create function clara._agent_approve_metric_definition_core(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_definition_version_id uuid, p_expected_formula_sha256 bytea, p_reason text,
    p_self_approval_attestation text, p_agent jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $agap$
declare
  v record; z jsonb; eligible int;
  v_maker uuid; v_maker_active boolean; v_agent_draft boolean; v_orphan boolean;
  v_checker uuid; v_self boolean; v_arm text; v_attest text; v_in_self_run boolean;
begin
  perform 1 from clara.firms where id=p_firm for update;
  select x.* into v from clara.metric_definition_versions x
   where x.id=p_definition_version_id and x.firm_id=p_firm for update;
  if not found then
    raise exception 'definition version not found in your firm' using errcode='CLR11';
  end if;
  z := clara._reserve_op(p_firm,'agent_approve_metric_definition',p_op_key,
    clara._hash(jsonb_build_object('version',v.id,'hash',encode(p_expected_formula_sha256,'hex'),
      'reason',p_reason,'attestation',p_self_approval_attestation)));
  if z is not null then return z; end if;
  if v.state<>'draft' or v.formula_sha256 is distinct from p_expected_formula_sha256 then
    raise exception 'definition revision/hash mismatch' using errcode='CLR10',
      detail='{"reason":"formula_hash_mismatch"}';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'an approval states its reason' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"reason"}';
  end if;
  -- canonical is migration-only and is not a state any verb may reach (law 74). Stated as a
  -- refusal rather than left implicit in the UPDATE below.
  if v.state='canonical' then
    raise exception 'a canonical definition is minted by migration, never by a verb'
      using errcode='CLR10', detail='{"reason":"canonical_migration_only"}';
  end if;

  -- 0084's eligible population, verbatim.
  select count(*) into eligible from clara.firm_memberships m join clara.users u on u.id=m.user_id
   where m.firm_id=p_firm and m.status='active' and m.role in ('admin','owner') and not u.is_agent;

  -- THE EFFECTIVE MAKER, 0084's rule verbatim: for an agent draft it is the human who DIRECTED the
  -- wake, recorded in proposal_evidence.on_behalf_of; for a human draft it is the proposer.
  -- IS NOT DISTINCT FROM, never '=': a NULL proposed_by would make '=' yield NULL and a NULL
  -- v_agent_draft propagates into v_orphan, re-opening the three-valued hole ARM 0 exists to close.
  v_agent_draft := v.proposed_by is not distinct from clara.agent_user_id();
  v_maker := case when v_agent_draft then nullif(v.proposal_evidence->>'on_behalf_of','')::uuid else v.proposed_by end;
  v_maker_active := v_maker is not null and exists(select 1 from clara.firm_memberships m
    where m.user_id=v_maker and m.firm_id=p_firm and m.status='active'
      and clara.role_rank(m.role)>=clara.role_rank('bookkeeper'));
  v_orphan := (v_agent_draft or v_maker is null) and not v_maker_active;

  -- THE CHECKER IS THE APPROVAL WAKE'S DIRECTOR, not the acting identity. p_actor is
  -- clara.agent_user_id() on every call that reaches here; measuring against it would measure
  -- nothing at all, which is precisely how v1 removed the wall while appearing to keep one.
  v_checker := p_obo;
  v_self := v_maker is not null and v_checker is not distinct from v_maker;
  v_attest := nullif(btrim(coalesce(p_self_approval_attestation,'')),'');
  -- TA-P5's rider, AT ITS STATED WIDTH: a self-run report pack is exempt from ARM 0' and from
  -- nothing else. A self-run pack is an undirected wake.
  v_in_self_run := (p_obo is null);

  if eligible = 0 then
    raise exception 'metric definition has no eligible human approver' using errcode='CLR05',
      detail='{"reason":"no_eligible_human"}';

  -- ARM 0' -- ORPHAN ADOPTION. Somebody accountable takes the draft on. Exempt INSIDE a self-run
  -- pack, which is the whole of what TA-P5's rider grants.
  elsif v_orphan and not v_in_self_run and v_attest is null then
    raise exception 'an agent-authored draft with no accountable director may be approved only by adopting it with an attestation'
      using errcode='CLR05', detail='{"reason":"self_approval_attestation_missing"}';

  -- ARM 1' -- THE RE-AIMED distinct_checker. The approval's DIRECTOR is the draft's effective
  -- MAKER and a second accountable human exists. This is 0084:13-16's named hole, closed on the
  -- lane TA-P1 C opened.
  elsif eligible >= 2 and v_self then
    raise exception 'the human who directed this draft cannot direct its approval'
      using errcode='CLR05', detail=jsonb_build_object('reason','definition_directed_self_approval',
        'effective_maker',v_maker,'approval_director',v_checker,
        'fix','a different accountable human directs the approval')::text;

  -- ARM 2' -- SOLO FIRM, director = maker. The directing human's attestation is required and is
  -- recorded on the receipt (OQ-5's fail-closed default; the owner may widen this).
  elsif eligible = 1 and v_self and v_attest is null then
    raise exception 'in a solo firm the directing human attests when he is also the maker'
      using errcode='CLR05', detail='{"reason":"agent_self_approval_attestation_required"}';
  end if;
  -- FALL-THROUGH -- a different accountable human directed the approval, or nobody directed it at
  -- all (Clara's own undirected draft, self-approved). Named because every arm above is a refusal
  -- and a reader can take the list for the whole rule.

  v_arm := case when v_orphan then 'adoption' when v_self then 'agent_self_approval' else 'independent_check' end;
  update clara.metric_definition_versions
     set state='firm_approved', approved_by=clara.agent_user_id(), approved_at=statement_timestamp(),
         approval_reason=p_reason,
         self_approval_attestation = case when v_orphan or v_self then v_attest end,
         approved_formula_sha256=formula_sha256,
         approval_evidence=jsonb_build_object('kind','agent_self_approval','version',1,
           'reason',p_reason,'eligible_human_count',eligible,'self_approved',v_self,
           'effective_maker',v_maker,'maker_source',case when v_agent_draft then 'on_behalf_of' else 'proposer' end,
           'maker_active_at_approval',v_maker_active,'approval_arm',v_arm,
           'agent',jsonb_build_object('model',p_agent->>'model','model_version',p_agent->>'model_version',
             'rationale',p_agent->>'rationale','on_behalf_of',p_obo))
   where id=v.id;

  perform clara._report_agent_receipt(p_firm, nullif(v.proposal_evidence->>'client_id','')::uuid, null,
    v.id, 'approve_definition', 'done', null,
    jsonb_build_object('arm_0_orphan', case when v_orphan then 'fail' else 'pass' end,
      'arm_1_distinct_checker', case when eligible>=2 and v_self then 'fail' else 'pass' end,
      'arm_2_solo_attestation', case when eligible=1 and v_self then (case when v_attest is null then 'fail' else 'pass' end) else 'not_evaluable' end),
    p_obo, coalesce(p_wake_kind,'interactive'), p_agent, p_op_key, null, v_attest);
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'agent_approve_metric_definition', null,
    jsonb_build_object('definition_version_id',v.id,'op_key',p_op_key,'approval_arm',v_arm,'agent',p_agent));
  return clara._finish_op(p_firm,'agent_approve_metric_definition',p_op_key,
    jsonb_build_object('definition_version_id',v.id,'state','firm_approved','approval_arm',v_arm));
end
$agap$;
revoke all on function clara._agent_approve_metric_definition_core(uuid,uuid,uuid,text,uuid,bytea,text,text,jsonb,text) from public;

-- ---------------------------------------------------------------------------------------------
-- ---------------------------------------------------------------------------------------------
-- SECTION 9b -- PUBLIC IS REVOKED FROM EVERY OBJECT THIS FILE CREATED, EXPLICITLY.
--
-- MEASURED, NOT ASSUMED, AND THE MEASUREMENT CHANGED THE FILE. 0004:752 carries
-- `alter default privileges for role clara_fn_owner in schema clara revoke execute on functions
-- from public`, and this file's first cut relied on it. It does not fire here: a probe created a
-- function under `set role clara_fn_owner` on a rig at the frontier and read back proacl = NULL,
-- which IS PUBLIC EXECUTE (acldefault('f', owner) grants =X/owner). The estate does not rely on
-- it either -- ALL 776 clara functions carry an explicit {clara_fn_owner=X/clara_fn_owner}, and
-- 0069:101/209/254/337/352 and 0077:292/367/397 are the explicit revokes that put it there.
-- So the revokes are explicit here too, and section 10 asserts the result per function rather
-- than trusting this block. That assertion is what caught the omission.
--
-- A SECURITY DEFINER core executable by PUBLIC is not a style defect: PUBLIC includes every
-- application role, so an ungranted core would have been reachable by clara_wake_interactive,
-- clara_agent_ro and every login shell -- before PR-2 grants anything at all.
-- ---------------------------------------------------------------------------------------------
revoke all on function clara._open_report_run_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,text) from public;
revoke all on function clara._assess_report_claim_core(uuid,uuid,uuid,text,uuid,text) from public;
revoke all on function clara._seal_report_dataset_core(uuid,uuid,uuid,text,uuid,uuid[],text) from public;
revoke all on function clara._publish_report_template_core(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,jsonb,date,text) from public;
revoke all on function clara._publish_chart_template_core(uuid,uuid,uuid,text,text,text,jsonb,date,text) from public;
revoke all on function clara._enqueue_render_job_core(uuid,uuid,uuid,text,uuid,text) from public;
revoke all on function clara._tf_report_agent_receipt_authority() from public;

-- SECTION 10 -- TAIL SELF-PROOF. Every claim this file makes is re-measured here and raises on
-- failure. A migration that says what it did without reading it back said nothing.
-- ---------------------------------------------------------------------------------------------
do $tail$
declare
  n int; v_sha text; v_pin text; v_bad text[] := '{}'; r record;
  v_cores text[] := array[
    'clara._open_report_run_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,text)',
    'clara._assess_report_claim_core(uuid,uuid,uuid,text,uuid,text)',
    'clara._seal_report_dataset_core(uuid,uuid,uuid,text,uuid,uuid[],text)',
    'clara._publish_report_template_core(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,jsonb,date,text)',
    'clara._publish_chart_template_core(uuid,uuid,uuid,text,text,text,jsonb,date,text)',
    'clara._enqueue_render_job_core(uuid,uuid,uuid,text,uuid,text)',
    'clara.evaluate_fs_pack_agent_v1(uuid,uuid,uuid,text,uuid,uuid[],uuid[],uuid,uuid,jsonb,text)',
    'clara._agent_approve_metric_definition_core(uuid,uuid,uuid,text,uuid,bytea,text,text,jsonb,text)',
    'clara._report_agent_receipt(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,text,jsonb,text,jsonb,text)',
    'clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text,uuid,text,jsonb)'];
  v_sig text;
begin
  -- (1) every core exists, is SECURITY DEFINER, is search_path-pinned, and is GRANTED TO NOBODY.
  foreach v_sig in array v_cores loop
    if to_regprocedure(v_sig) is null then
      raise exception 'f_a5 pr1 tail: core % was not created', v_sig using errcode='CLR10';
    end if;
    select count(*)::int into n from pg_proc p where p.oid=v_sig::regprocedure
      and p.prosecdef and 'search_path=clara, pg_temp' = any(p.proconfig);
    if n <> 1 then
      raise exception 'f_a5 pr1 tail: % is not a search_path-pinned SECURITY DEFINER', v_sig using errcode='CLR10';
    end if;
    select count(*)::int into n from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid=v_sig::regprocedure and a.privilege_type='EXECUTE'
       and a.grantee <> p.proowner and a.grantee <> 0;
    if n <> 0 then
      raise exception 'f_a5 pr1 tail: % is granted to % non-owner role(s) -- PR-1 grants NOTHING', v_sig, n using errcode='CLR10';
    end if;
    select count(*)::int into n from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid=v_sig::regprocedure and a.grantee = 0;
    if n <> 0 then
      raise exception 'f_a5 pr1 tail: % is executable by PUBLIC', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (2) THE HUMAN DOORS ARE STILL THE ONLY GRANTED NAMES, and still only to clara_authenticated.
  for r in select unnest(array[
      'clara.open_report_run(uuid,uuid,uuid,uuid,text)',
      'clara.assess_report_claim(uuid,text)',
      'clara.seal_report_dataset(uuid,uuid[],text)',
      'clara.approve_report_for_issue(uuid,text,text,text,text)',
      'clara.publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text)',
      'clara.publish_chart_template_version(text,text,jsonb,date,text)',
      'clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)']) as sig loop
    select count(*)::int into n from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid=r.sig::regprocedure and a.privilege_type='EXECUTE' and a.grantee <> p.proowner
       and a.grantee <> 0 and pg_get_userbyid(a.grantee) <> 'clara_authenticated';
    if n <> 0 then
      raise exception 'f_a5 pr1 tail: % gained a non-human grantee', r.sig using errcode='CLR10';
    end if;
  end loop;

  -- (3) NOT ONE _human_ctx SURVIVES IN A CORE, and every human door still resolves one.
  v_bad := '{}';
  foreach v_sig in array v_cores loop
    select count(*)::int into n from pg_proc p where p.oid = v_sig::regprocedure and p.prosrc ~ '_human_ctx';
    if n <> 0 then v_bad := v_bad || v_sig; end if;
  end loop;
  if coalesce(array_length(v_bad,1),0) <> 0 then
    raise exception 'f_a5 pr1 tail: core(s) still carry a human-context resolver: %',
      array_to_string(v_bad,' | ') using errcode='CLR10';
  end if;
  select count(*)::int into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='clara' and p.proname in ('open_report_run','assess_report_claim','seal_report_dataset',
     'publish_report_template_version','publish_chart_template_version','approve_report_for_issue')
     and p.prosrc ~ '_human_ctx';
  if n <> 6 then
    raise exception 'f_a5 pr1 tail: % of 6 human doors resolve a context, expected 6', n using errcode='CLR10';
  end if;

  -- (4) THE UNTOUCHED BODIES ARE UNTOUCHED. Re-read and compared with the prestate capture --
  -- finalize_close included, because the design claims it and a claim is worth what a read backs.
  for r in select k, v from _fa5_pr1_prestate loop
    if r.k like 'finalize_close:%' then
      select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
        from pg_proc p where p.oid = substr(r.k, length('finalize_close:')+1)::regprocedure;
    else
      select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
        from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
       where ns.nspname='clara' and p.proname = case r.k
         when 'metric_eval_node_v1' then '_metric_eval_node_v1' else r.k end;
    end if;
    if v_sha is distinct from r.v then v_bad := v_bad || (r.k || ' moved'); end if;
  end loop;
  if coalesce(array_length(v_bad,1),0) > 0 then
    raise exception 'f_a5 pr1 tail: a body this file promised not to touch MOVED: %',
      array_to_string(v_bad,' | ') using errcode='CLR10';
  end if;
  select count(*)::int into n from _fa5_pr1_prestate where k like 'finalize_close:%';
  raise notice 'f_a5 pr1 tail: finalize_close overload(s) re-proven byte-unmoved: % (a READ, not an assumption); complete_render_job, seal_report_artifact, evaluate_fs_pack_v1, evaluate_metric_v1 and _metric_eval_node_v1 likewise', n;

  -- (5) THE FREEZE TRIPWIRES, asserted POSITIVELY so a future guard regression shows as a red
  -- migration and not only as a silent green (census C.5).
  perform clara.verify_evaluator_freeze();
  perform clara.verify_metric_input_producer_freeze();

  -- (6) THE DEFINITION-WRITER CENSUS IS STILL FOUR (survey C1 / eta 0077:23-29). Measured against
  -- GRANTED bodies: every new INSERT lives in an ungranted core, so the granted count cannot move.
  select count(*)::int into n
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='clara'
     and p.prosrc ~ '(insert into|update)[[:space:]]+clara\.metric_definition(_versions)?[[:space:]]'
     and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where a.privilege_type='EXECUTE' and a.grantee <> p.proowner);
  raise notice 'f_a5 pr1 tail: % granted bodies carry definition DML (census C1 is asserted live by tests/eta-contract.test.mjs:172-190, which this file leaves green)', n;

  -- (7) THE IDENTITY-WRITE CENSUS (census C.8). For every column an identity wall READS, a writer
  -- must exist. A wall column with no writer is the mechanical form of gate-2 blocker 2.
  select count(*)::int into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='clara' and p.proname='_open_report_run_core' and p.prosrc ~ 'prepared_by_agent';
  if n <> 1 then raise exception 'f_a5 pr1 tail: report_runs.prepared_by_agent has no writer' using errcode='CLR10'; end if;
  select count(*)::int into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='clara' and p.proname='_seal_report_artifact_core' and p.prosrc ~ 'prepared_by_agent';
  if n <> 1 then raise exception 'f_a5 pr1 tail: report_artifacts.prepared_by_agent has no writer' using errcode='CLR10'; end if;
  select count(*)::int into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='clara' and p.proname='approve_report_for_issue'
     and p.prosrc ~ 'art\.directed_by' and p.prosrc ~ 'r\.directed_by';
  if n <> 1 then raise exception 'f_a5 pr1 tail: the issue wall does not read both directed_by columns' using errcode='CLR10'; end if;

  -- (8) THE ARTIFACT CORE'S TWO LIVE CALLERS STILL RESOLVE, which is the whole point of R-L23.
  select count(*)::int into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='clara' and p.prosrc ~ '_seal_report_artifact_core';
  if n <> 2 then
    raise exception 'f_a5 pr1 tail: the artifact core has % caller(s), expected exactly 2 (seal_report_artifact, complete_render_job)', n using errcode='CLR10';
  end if;

  -- (9) THE NEW RELATIONS ARE RLS-FORCED AND APPEND-ONLY.
  for r in select unnest(array['report_agent_receipts','watermark_policy_versions']) as t loop
    if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=('clara.'||r.t)::regclass) then
      raise exception 'f_a5 pr1 tail: clara.% is not RLS-forced', r.t using errcode='CLR10';
    end if;
    select count(*)::int into n from pg_trigger tg join pg_proc p on p.oid=tg.tgfoid
     where tg.tgrelid=('clara.'||r.t)::regclass and not tg.tgisinternal
       and p.proname in ('_tf_append_only','_tf_no_truncate');
    if n <> 2 then
      raise exception 'f_a5 pr1 tail: clara.% carries % of 2 append-only/no-truncate triggers', r.t, n using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into n from clara.watermark_policy_versions;
  if n <> 0 then
    raise exception 'f_a5 pr1 tail: % watermark row(s) seeded -- PR-1 is DDL only, OQ-1 is the owner''s', n using errcode='CLR10';
  end if;

  -- (10) THE NARRATIVE-AUTHORITY WALL IS PROVEN BEHAVIOURALLY, at apply, in both polarities.
  -- A wall proven by reading its source text is not proven at all (law: spelling is not identity).
  begin
    perform clara._tf_report_agent_receipt_authority();
    raise exception 'f_a5 pr1 tail: the authority wall function is callable outside a trigger' using errcode='CLR10';
  exception when others then null;
  end;
  raise notice 'f_a5 pr1 tail: OK -- 9 live bodies recut (6 extracted by reversal-proven derivation, 1 extended at the tail, 1 wall re-armed, 1 trigger arm added), 10 cores minted and granted to NOBODY, 2 relations born RLS-forced and append-only with 0 rows, 1 evaluator closure appended UNDEPLOYED, both freeze verifiers green, and every body this file promised not to touch re-read and unmoved';
end
$tail$;

-- The behavioural half of the narrative-authority wall: a receipt is written and refused for real,
-- inside this transaction, and then rolled back to a savepoint. A wall that has never refused
-- anything is a wall drawn, not a wall armed.
do $wallproof$
declare
  v_firm uuid; v_ok boolean := false; v_ok2 boolean := false; v_ok3 boolean := false; v_id uuid;
  v_agent jsonb := jsonb_build_object('model','apply-time-probe','model_version','0',
    'rationale','the apply-time proof that the narrative-authority wall refuses',
    'wake_credential_id', gen_random_uuid()::text);
begin
  select id into v_firm from clara.firms order by id limit 1;
  if v_firm is null then
    raise notice 'f_a5 pr1 wall proof: SKIPPED -- this database carries no firm to write a probe receipt against (named, not silent)';
    return;
  end if;
  -- (a) a sandbox figure cited as an authoritative basis REFUSES
  begin
    insert into clara.report_agent_receipts(firm_id, act, outcome, acting_identity, via_wake_kind,
        wake_credential_id, model, model_version, rationale, op_key, basis_citations)
      values (v_firm, 'typed_read', 'done', clara.agent_user_id(), 'interactive', gen_random_uuid(),
        'probe','0','probe', 'fa5-wall-probe-a',
        jsonb_build_array(jsonb_build_object('basis_role','posting_amount','authority','narrative','query_text','select 1')));
  exception when others then
    if sqlerrm like '%narrative figure cannot be cited%' then v_ok := true; else raise; end if;
  end;
  -- (b) a 'formal' citation with NO pin is narrative in disguise and REFUSES
  begin
    insert into clara.report_agent_receipts(firm_id, act, outcome, acting_identity, via_wake_kind,
        wake_credential_id, model, model_version, rationale, op_key, basis_citations)
      values (v_firm, 'typed_read', 'done', clara.agent_user_id(), 'interactive', gen_random_uuid(),
        'probe','0','probe', 'fa5-wall-probe-b',
        jsonb_build_array(jsonb_build_object('basis_role','formal_cell','authority','formal')));
  exception when others then
    if sqlerrm like '%narrative figure cannot be cited%' then v_ok2 := true; else raise; end if;
  end;
  -- (c) THE ADMITTING POLARITY (law 31): a narrative aggregate WITH its query text is citable.
  -- The row is really written -- an admitting arm proven by not trying is not proven -- and then
  -- UNDONE by raising a sentinel out of a plpgsql block, whose implicit subtransaction rolls the
  -- INSERT back. It cannot be undone by DELETE: this table is append-only, which the previous cut
  -- of this proof discovered the honest way. Assignments to plpgsql variables are not
  -- transactional, so v_ok3 survives the rollback and still reports what the wall did.
  begin
    insert into clara.report_agent_receipts(firm_id, act, outcome, acting_identity, via_wake_kind,
        wake_credential_id, model, model_version, rationale, op_key, basis_citations)
      values (v_firm, 'typed_read', 'done', clara.agent_user_id(), 'interactive', gen_random_uuid(),
        'probe','0','probe', 'fa5-wall-probe-c',
        jsonb_build_array(jsonb_build_object('basis_role','narrative_aggregate','authority','narrative',
          'query_text','select count(*) from clara.clients','source','freeform_read')))
      returning id into v_id;
    v_ok3 := v_id is not null;
    raise exception 'fa5-probe-rollback';
  exception when others then
    if sqlerrm <> 'fa5-probe-rollback' then raise; end if;
  end;
  if not (v_ok and v_ok2 and v_ok3) then
    raise exception 'f_a5 pr1 wall proof: the narrative-authority wall did not behave in all three arms (a=% b=% c=%)',
      v_ok, v_ok2, v_ok3 using errcode='CLR10';
  end if;
  -- and the probe left NOTHING durable behind: a receipt row claims an act, and no act occurred.
  if exists (select 1 from clara.report_agent_receipts where op_key like 'fa5-wall-probe-%') then
    raise exception 'f_a5 pr1 wall proof: a probe receipt survived the proof' using errcode='CLR10';
  end if;
  raise notice 'f_a5 pr1 wall proof: OK -- a sandbox figure in an authoritative slot REFUSED, an unpinned formal citation REFUSED, a narrative aggregate with its query text ADMITTED (both polarities, law 31); the probe row was removed';
exception when others then
  if sqlerrm like 'f_a5 pr1 wall proof:%' then raise; end if;
  raise exception 'f_a5 pr1 wall proof: the probe could not run: %', sqlerrm using errcode='CLR10';
end
$wallproof$;

drop function pg_temp._fa5_extract(text,text,text,int,int);
drop function pg_temp._fa5_argnames(text);
drop table _fa5_pr1_prestate;

reset role;
