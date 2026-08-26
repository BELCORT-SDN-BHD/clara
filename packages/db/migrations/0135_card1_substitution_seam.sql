-- 0135_card1_substitution_seam.sql -- Wave F Track-A, F-A5b CARD 1: the SUBSTITUTION SEAM,
-- stages (a) and (b). Number is claimed at MERGE by the conductor (standing law); nothing in this
-- file, in its censuses or in its battery keys on the number -- every claim below reads the LIVE
-- CATALOG, never a filename and never clara.schema_migrations.
--
-- DESIGN OF RECORD: docs/plan/active/card1-substitution-seam-design.md (v3, gate-PASSed
-- 2026-08-26) SS1-SS2 · -design-part2.md SS3 · -design-part3.md SS4-SS7 ·
-- card1-substitution-seam-annexes.md (A surface, B battery, C decisions CD-1..CD-16, D
-- predictions, E risks, F acceptance). Estate survey: research/card1-substitution-seam-survey.md
-- + -part2.md (S1-S48). Implements the 2026-08-23 owner sitting's card-1 ruling, recorded at
-- sandbox-export-design.md SS3.6b: "the model writes placeholders into p_body, never a typed
-- numeral; the renderer substitutes each placeholder with the DB-read value."
--
-- THIS FILE IS HARD CONSTRAINT 2's MACHINERY FOR NARRATIVE EXPORTS. Before it, a sandbox export
-- carrying a FIGURE had only one shape: a model typing the numeral into displayed_text. After it,
-- a figure enters an export ONLY as a POINTER the database resolves -- stage (a) -- or as the
-- output of a versioned deterministic evaluator over DB-owned inputs -- stage (b). SS2 and SS3 are
-- judgement logic end to end (review law 1): every guard here takes an independent review pass.
--
-- ============================ WHAT MOVES, AND WHAT DELIBERATELY DOES NOT =========================
-- NEW: 10 functions (2 v2 validators, 1 v2 node evaluator, 1 v2 entrypoint, 1 v2 compose core,
-- 1 v2 wake wrapper, 4 sandbox job-family verbs), 1 evaluator_versions closure row (BORN
-- UNDEPLOYED -- BL-3/CD-15), 1 metric_primitives row, 1 wake_fn_allowlist row.
-- ALTERED (this build is NOT DDL-free -- BL-1/BL-6, design SS4's own correction):
--   clara.metric_primitives -- its inline primitive_key CHECK is dropped (name read LIVE from
--     pg_constraint, never guessed) and re-added widened 11 -> 12 literals, extend-only.
--   clara.sandbox_exports  -- seven dispatch/cap columns + the paired CHECK, mirroring
--     clara.render_jobs' own shape (0079:100-168) so a lawful claim/dispatch pair can exist.
-- CoR'd (create or replace of a LIVE body -- the FILES that defined them stay immutable):
--   clara._sandbox_client_set          (0132:549)  -- SS2.2, the placeholder block arm
--   clara.sandbox_export_payload       (0132:946)  -- SS2.4, the pinned `cells` pre-join
--   clara._tf_sandbox_export_lifecycle (0132:345)  -- SS2.6, the widened mutable array
--   clara._tf_metric_cell_integrity    (0060:237)  -- SS3.2 item 6, evaluator-version branching
-- UNMOVED, stated so nothing is inferred: metric_cells' S17 double wall (model_proposal_id /
-- human_approval_id / supersedes_cell_id stay forced null, CHECK untouched); clara_runtime holds
-- NO table grant on clara.metric_cells (the widened payload function is the only door);
-- clara_agent_ro gains nothing anywhere; render_jobs, the seal chain and report_artifacts are not
-- touched; propose_metric_definition / approve_metric_definition / _validate_metric_ast_shape_v1
-- stay v1-scoped (CD-14 APPROVED + N3's second door -- no canonical `cell`-referencing definition
-- is buildable through this file, at EITHER door).
--
-- ============================ D1 -- FOUR CoR'd BODIES, THE OBLIGATION NAMED ======================
-- Four live behavioural surfaces are replaced. PostgreSQL runs an in-flight PL/pgSQL call to
-- completion on the body it STARTED with, so a call spanning this migration silently runs the OLD
-- body. The two sandbox bodies (_sandbox_client_set, sandbox_export_payload) and the sandbox
-- lifecycle trigger have NO live caller on any deployed chain (F-A5b PR-1 has not been
-- ceremonied), so their D1 exposure is nil TODAY -- named here rather than left to be derived.
-- clara._tf_metric_cell_integrity IS live: a metric_cells INSERT spanning this migration would run
-- the pre-widening trigger. Its widened form is a strict SUPERSET (the v1 arm is byte-identical in
-- behaviour, proven by battery cell B5.1), so the D1 window is a courtesy rather than a
-- correctness requirement -- but it is a WRITE-QUIESCE window all the same and the ceremony must
-- take it. SECTION 0 pins all four pre-image bodies by sha256 and ABORTS on drift.
--
-- ============================ STAGE (b) SHIPS DARK -- THIS IS BY DESIGN ==========================
-- The ('evaluate_metric', 2) row is BORN UNDEPLOYED and THIS FILE DOES NOT FLIP IT (BL-3/CD-15).
-- clara._tf_evaluator_deploy_once (0060:93-103) refuses the flip unless current_user = session_user
-- -- i.e. unless the deploying session holds NO active SET ROLE -- and every migration below runs
-- most of its body under `set role clara_fn_owner`, so an in-migration flip would refuse by
-- construction. Until a SEPARATE, LATER ceremony runs
--     UPDATE clara.evaluator_versions SET deployed = true
--      WHERE evaluator_name = 'evaluate_metric' AND version = 2
-- under the bare migration-runner principal, EVERY clara.wake_compose_metric_preview_v2 call
-- refuses `evaluator_undeployed`. That is the EXPECTED post-merge state, not a defect
-- (Annex E R-CD-4). clara.evaluate_fs_pack_agent_v1 (0111) has sat in exactly this posture since
-- it landed. packages/db/scripts/deploy-evaluator-version.mjs is the ceremony's wrapper.
--
-- The timeout is PRECAUTIONARY: nothing here rewrites table data (the two ALTERs add nullable or
-- defaulted columns and re-add one CHECK over a 12-row catalog table).
set local statement_timeout = '20min';

create temp table _card1_pre(k text primary key, v text not null) on commit drop;
insert into _card1_pre values ('deploy_user', session_user), ('deploy_role', current_role);
-- THE interactive_client ROSTER, CAPTURED RATHER THAN COUNTED. This file's tail must prove one
-- thing about that wake kind: THIS FILE DID NOT TOUCH IT. A literal count cannot say that -- it
-- says "the roster is N", which is a claim about the whole estate's frontier and goes stale the
-- moment any other lane makes a ruled widening (0129's SS4 chat-parity copy and 0131's audited
-- free read each already did). Capturing the roster HERE and comparing it at the tail is a
-- DIFFERENTIAL: it refuses if this file added, removed or re-cut a row, and it stays correct
-- across every frontier move, which is exactly what a count cannot do.
insert into _card1_pre
  select 'interactive_client_roster',
         coalesce(string_agg(function_name, ',' order by function_name), '')
    from clara.wake_fn_allowlist where wake_kind = 'interactive_client';

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every claim this file makes about what it is editing is MEASURED here
-- and aborts on a false premise, rather than being discovered half-applied.
-- =====================================================================================
do $s0$
declare
  v_present text[] := '{}';
  v_missing text[] := '{}';
  v_sig text;
  v_n int;
  v_check text;
  v_cols text[];
  v_sha text;
  v_expected text;
begin
  -- (a) Nothing this file MINTS may already exist.
  foreach v_sig in array array[
      'clara._validate_metric_node_v2(jsonb,uuid,uuid,integer)',
      'clara.validate_metric_ast_v2(jsonb,uuid,uuid)',
      'clara._metric_eval_node_v2(uuid,uuid,uuid,uuid,uuid,jsonb,boolean,text,date)',
      'clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)',
      'clara._eta_compose_metric_preview_core_v2(uuid,uuid,uuid,text,uuid,jsonb,uuid[],uuid,text)',
      'clara.wake_compose_metric_preview_v2(uuid,jsonb,uuid[],uuid,text)',
      'clara.claim_sandbox_export(text,interval)',
      'clara.sandbox_dispatch_begin(interval,int)',
      'clara.sandbox_dispatch_record(uuid[],boolean,jsonb)',
      'clara.reap_exhausted_sandbox_exports()'
    ] loop
    if to_regprocedure(v_sig) is not null then v_present := v_present || v_sig; end if;
  end loop;
  if exists (select 1 from clara.evaluator_versions
      where evaluator_name = 'evaluate_metric' and version = 2 and firm_id is null) then
    v_present := v_present || 'clara.evaluator_versions(evaluate_metric,2)';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist where function_name = 'wake_compose_metric_preview_v2') then
    v_present := v_present || 'clara.wake_fn_allowlist(wake_compose_metric_preview_v2)';
  end if;
  if coalesce(array_length(v_present,1),0) > 0 then
    raise exception 'card1 seam prestate: object(s) this file mints already exist: %', array_to_string(v_present,' | ') using errcode = 'CLR10';
  end if;

  -- (b) Everything this file CALLS or REPLACES must already exist.
  foreach v_sig in array array[
      'clara.metric_cells','clara.metric_cell_periods','clara.metric_units','clara.metric_primitives',
      'clara.metric_definition_versions','clara.metric_evaluation_contexts',
      'clara.metric_evaluation_context_periods','clara.metric_input_snapshots',
      'clara.evaluator_versions','clara.evaluator_version_members','clara.wake_fn_allowlist',
      'clara.sandbox_views','clara.sandbox_exports','clara.render_jobs','clara.clients'
    ] loop
    if to_regclass(v_sig) is null then v_missing := v_missing || v_sig; end if;
  end loop;
  foreach v_sig in array array[
      'clara._sandbox_client_set(uuid,jsonb,jsonb)',
      'clara.sandbox_export_payload(uuid,text)',
      'clara._tf_sandbox_export_lifecycle()',
      'clara._tf_metric_cell_integrity()',
      'clara._tf_metric_context_integrity()',
      'clara._validate_metric_node_v1(jsonb,integer)',
      'clara.validate_metric_ast_v1(jsonb)',
      'clara._metric_eval_node_v1(uuid,uuid,uuid,uuid,jsonb,boolean,text,date)',
      'clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)',
      'clara._normalize_metric_node_v1(jsonb)',
      'clara._metric_selector_account_ids(uuid,jsonb)',
      'clara._metric_input_dataset_v1(uuid,uuid,uuid[])',
      'clara._metric_context_sha256_v1(uuid,uuid[],uuid,uuid,uuid,uuid,bytea,text)',
      'clara._metric_resolved_inputs_sha256_v1(bytea,uuid[],uuid,uuid,uuid,bytea,uuid[],uuid[],uuid,uuid,uuid,text)',
      'clara._hash(jsonb)',
      'clara._eta_compose_metric_preview_core(uuid,uuid,uuid,text,uuid,jsonb,uuid[],uuid,text)',
      'clara.wake_compose_metric_preview(uuid,jsonb,uuid[],uuid,text)',
      'clara.verify_evaluator_freeze()',
      'clara.wake_context()','clara.assert_wake_allowed(text,text)','clara.agent_user_id()',
      'clara._reserve_op(uuid,text,text,bytea)','clara._finish_op(uuid,text,text,jsonb)',
      'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)','clara._human_ctx(int)','clara.role_rank(text)'
    ] loop
    if to_regprocedure(v_sig) is null then v_missing := v_missing || v_sig; end if;
  end loop;
  if coalesce(array_length(v_missing,1),0) > 0 then
    raise exception 'card1 seam prestate: prerequisite object(s) absent: %', array_to_string(v_missing,' | ') using errcode = 'CLR10';
  end if;

  -- (c) BL-1's premise, MEASURED: metric_primitives carries exactly the ELEVEN literals, its
  -- primitive_key CHECK exists, and that CHECK does NOT already admit 'cell'. A file that assumed
  -- any of the three would either widen a constraint that had already moved, or insert against one
  -- that still refuses.
  select count(*) into v_n from clara.metric_primitives;
  if v_n <> 11 then
    raise exception 'card1 seam prestate: metric_primitives holds % row(s), expected the closed eleven', v_n using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.metric_primitives where primitive_key = 'cell') then
    raise exception 'card1 seam prestate: the cell primitive already exists' using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_check from pg_constraint
   where conrelid = 'clara.metric_primitives'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%primitive_key%';
  if v_check is null then
    raise exception 'card1 seam prestate: no primitive_key CHECK found on clara.metric_primitives -- BL-1''s whole premise is that one exists and is closed to eleven literals' using errcode = 'CLR10';
  end if;
  if v_check like '%''cell''%' then
    raise exception 'card1 seam prestate: the primitive_key CHECK already admits ''cell'' -- live: %', v_check using errcode = 'CLR10';
  end if;

  -- (d) BL-6's premise: NONE of the seven dispatch/cap columns may already exist on
  -- clara.sandbox_exports (an ALTER ... ADD COLUMN would fail loudly, but a PARTIAL pre-existing
  -- set would leave the paired CHECK asserting something this file never proved).
  select coalesce(array_agg(column_name order by column_name), '{}') into v_cols
    from information_schema.columns
   where table_schema = 'clara' and table_name = 'sandbox_exports'
     and column_name in ('max_attempts','first_claimed_at','claim_delay_ms','dispatch_attempts',
                         'last_dispatch_at','last_dispatch_ok','last_dispatch_error');
  if coalesce(array_length(v_cols,1),0) <> 0 then
    raise exception 'card1 seam prestate: clara.sandbox_exports already carries dispatch column(s): %', array_to_string(v_cols,', ') using errcode = 'CLR10';
  end if;

  -- (e) THE SUPERSEDED-BODY LAW. Every body this file CoRs is pinned by the sha256 of its LIVE
  -- prosrc. A drift means the estate moved that body under this design (Annex E R-CD-2's own named
  -- risk: F-A5b PR-1's fix-rounds land on the same four magnets) -- abort rather than replace a
  -- body nobody read. Re-read the live body, re-derive the replacement, then re-pin.
  for v_sig, v_expected in
    select * from (values
      ('clara._sandbox_client_set(uuid,jsonb,jsonb)',          '1260aa619ead9870a6ffb6ce0584d4102d8fe9b12b5feb323dc94fcd9aa94d43'),
      ('clara.sandbox_export_payload(uuid,text)',              'd9477a73b2a82ac9091be442968a965b8b8b0501e82f586e8ef4d31b1c081491'),
      ('clara._tf_sandbox_export_lifecycle()',                 '9b29676b70013785ae08033961b86885139f2604d93d92d36cd9d6c9a41d66fa'),
      ('clara._tf_metric_cell_integrity()',                    'fc07ce252069cfdfdc9a0421592ad6c30fa027f74fb7933ebc94746830fb6471'),
      ('clara._tf_metric_context_integrity()',                 '684e37aae8db8d72a777206e58a4f65777b5096fb29edaa7f82731429e804968')
    ) t(sig, sha)
  loop
    select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
      from pg_proc where oid = v_sig::regprocedure;
    if v_sha is distinct from v_expected then
      raise exception 'card1 seam prestate: % pre-image prosrc sha mismatch -- expected %, found %. The estate moved this body; re-read it before CoR-ing.', v_sig, v_expected, v_sha using errcode = 'CLR10';
    end if;
  end loop;

  -- (f) The v1 closure this file appends BESIDE must be registered (whatever its deploy state --
  -- a fresh rig has it undeployed, a ceremonied estate has it deployed; neither is this file's
  -- business, and asserting either would be a false premise on the other).
  if not exists (select 1 from clara.evaluator_versions
      where evaluator_name = 'evaluate_metric' and version = 1 and firm_id is null) then
    raise exception 'card1 seam prestate: the (evaluate_metric, 1) closure is not registered -- this file appends v2 beside it and must not be the row that mints the family' using errcode = 'CLR10';
  end if;

  raise notice 'card1 seam prestate: clean -- 10 functions + 1 closure row + 1 allowlist row absent, prerequisites present, metric_primitives closed at 11 without cell, sandbox_exports carries none of the 7 dispatch columns, all FIVE CoR pre-image bodies pinned (the fifth, _tf_metric_context_integrity, is the reference BL-4''s four-item census missed)';
end
$s0$;

set role clara_fn_owner;

-- =====================================================================================
-- SECTION 1 -- STAGE (a): the `placeholder` block kind (design SS2.1-SS2.3).
--
-- clara._sandbox_client_set is CoR'd. It is a plain ungranted core -- not evaluate_*-named, not a
-- member of any frozen evaluator closure -- so it carries no freeze obligation (S23's scope note).
--
-- THE BLOCK-KIND CHECK BECOMES A GENUINE THREE-ARMED CHAIN (N1). 0132's own check is a single
-- plain `if v_kind is distinct from 'text'` because there was only ONE kind to admit; there are
-- now two, and an unrecognised third still refuses with the SAME token 0132 already raises.
--
-- M3 -- THE NON-BLANK displayed_text CHECK STAYS IN THE TEXT ARM AND NOWHERE ELSE. A placeholder
-- block carries no displayed_text field at all (SS2.1's closed shape), so running 0132's check
-- against one would refuse every lawful placeholder.
--
-- M4 -- THE CLOSED KEY SET IS `placeholder`-ONLY, AND NEW. 0132's text-block validation does NOT
-- reject an unrecognised extra key on a `text` block; that is its shipped behaviour and this file
-- does not silently narrow it. Only `placeholder` -- a brand-new kind with no existing callers to
-- break -- gets a closed key check. Battery B1.7 forces BOTH polarities.
--
-- S30 / ITEM 4 -- A PLACEHOLDER BLOCK DOES NOT SET v_has_free_text. This is the exact,
-- non-side-effect change 0132's own header predicted at :541-542 ("reversible the day a
-- non-free-text block kind exists"). A body made ENTIRELY of placeholder blocks therefore derives
-- the EXACT client set; a MIXED body still widens to firm_closure, because a text block is still
-- free text. That boundary is a DIFFERENTIAL, not a claim: B1.4 asserts both returned fields.
--
-- N8 -- A PLACEHOLDER-ONLY VIEW CAN GENUINELY BE CROSS-CLIENT. The derivation loop below runs once
-- per USED LABEL and appends each resolved client_id independently, so two placeholder blocks
-- citing two clients' cells derive {A,B}, not a refusal. This is the deliberate mirror-image of
-- stage (b), where a SINGLE formula is bound to ONE p_client and cross-client is structurally
-- unreachable: the constraint lives in the EVALUATOR's signature, not in this loop.
-- =====================================================================================
create or replace function clara._sandbox_client_set(p_firm uuid, p_basis jsonb, p_body jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_blocks jsonb; v_block jsonb; v_ref text; v_kind text;
  v_basis_elem jsonb; v_found boolean; v_label text; v_label_id text;
  v_labels text[] := '{}'; v_distinct_count int; v_has_free_text boolean := false;
  v_used_labels text[] := '{}';
  v_client_set uuid[] := '{}';
  v_basis_kind text;
  v_uses_firm_closure boolean := false;
  v_fa6_scope_present boolean;
  v_preview_client uuid;
  v_fr_scope text; v_fr_client_scope uuid;
  v_firm_roster uuid[];
  v_firm_all uuid[];
  v_client_set_exact uuid[];
  v_cell_status text;
begin
  if p_basis is null or jsonb_typeof(p_basis) <> 'array' or jsonb_array_length(p_basis) = 0 then
    raise exception 'a sandbox view needs at least one cited basis row' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_view_basis_absent"}';
  end if;
  if p_body is null or jsonb_typeof(p_body) <> 'object' or (p_body -> 'blocks') is null
     or jsonb_typeof(p_body -> 'blocks') <> 'array' or jsonb_array_length(p_body -> 'blocks') = 0 then
    raise exception 'a sandbox view body must carry at least one typed block' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_view_body_malformed","class":"blocks"}';
  end if;

  -- F-A6 PR-1's hardened freeform_read_log shape is MEASURED, never assumed (0132's own idiom,
  -- carried forward verbatim).
  select exists(select 1 from information_schema.columns
    where table_schema = 'clara' and table_name = 'freeform_read_log' and column_name = 'scope')
    into v_fa6_scope_present;

  -- (i)+(ii) A1: validate EVERY basis element up front -- UNCHANGED from 0132.
  for v_basis_elem in select * from jsonb_array_elements(p_basis) loop
    v_label := v_basis_elem ->> 'label';
    if nullif(btrim(coalesce(v_label,'')),'') is null then
      raise exception 'a basis element carries no label' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_basis_malformed","class":"label_absent"}';
    end if;
    v_labels := v_labels || v_label;

    v_label_id := v_basis_elem ->> 'id';
    if v_label_id is null or v_label_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'a basis element carries a malformed id' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label)::text;
    end if;

    v_basis_kind := v_basis_elem ->> 'kind';
    if v_basis_kind = 'preview_cell' then
      if not exists(select 1 from clara.metric_cells where id = v_label_id::uuid and firm_id = p_firm) then
        raise exception 'a cited preview cell does not resolve in your firm' using errcode = 'CLR11',
          detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label)::text;
      end if;
    elsif v_basis_kind = 'freeform_read' then
      if not v_fa6_scope_present then
        raise exception 'a freeform-read basis cannot be resolved on this chain yet' using errcode = 'CLR11',
          detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label,
            'note','free-read basis kinds are unavailable until F-A6 PR-1 lands (Annex K)')::text;
      end if;
      if not exists(select 1 from clara.freeform_read_log where id = v_label_id::uuid and firm_id = p_firm) then
        raise exception 'a cited freeform read does not resolve in your firm' using errcode = 'CLR11',
          detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label)::text;
      end if;
    else
      raise exception 'a basis element has an unrecognised kind' using errcode = 'CLR11',
        detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label)::text;
    end if;
  end loop;
  select count(distinct l) into v_distinct_count from unnest(v_labels) l;
  if v_distinct_count <> cardinality(v_labels) then
    raise exception 'the basis carries a duplicate label' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_view_basis_malformed","class":"label_duplicate"}';
  end if;

  v_blocks := p_body -> 'blocks';
  for v_block in select * from jsonb_array_elements(v_blocks) loop
    if jsonb_typeof(v_block) <> 'object' then
      raise exception 'a sandbox view body block must be an object' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_body_malformed","class":"block_shape"}';
    end if;
    v_kind := v_block ->> 'kind';

    if v_kind = 'text' then
      -- UNCHANGED from 0132:636-640. M3: the non-blank displayed_text check lives HERE, in the
      -- text arm, and must never run against a placeholder block.
      v_has_free_text := true;
      if nullif(btrim(coalesce(v_block ->> 'displayed_text', '')), '') is null then
        raise exception 'a text block must carry non-blank displayed_text' using errcode = 'CLR10',
          detail = '{"reason":"sandbox_view_body_malformed","class":"displayed_text"}';
      end if;

    elsif v_kind = 'placeholder' then
      -- M4: closed key set, placeholder-only. A placeholder block carries NO numeral-shaped field
      -- at all -- which is what makes sandbox_view_body_malformed's old "figure shaped as a
      -- number" reason a PROVENANCE assertion rather than a TYPE assertion
      -- (sandbox-export-design.md:411-413's own re-cut target, realized here).
      if exists (select 1 from jsonb_object_keys(v_block) k where k <> all(array['kind','basis_ref'])) then
        raise exception 'a placeholder block carries a key outside its closed shape' using errcode = 'CLR10',
          detail = '{"reason":"sandbox_view_body_malformed","class":"placeholder_unknown_key","fix":"a placeholder block carries exactly kind and basis_ref"}';
      end if;
      -- v_has_free_text is DELIBERATELY NOT set (S30, and the header above).

    else
      raise exception 'a sandbox view body block carries an unsupported kind' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','sandbox_view_body_malformed','class','block_kind_unsupported','kind',v_kind)::text;
    end if;

    -- basis_ref presence + label membership: UNCHANGED and KIND-AGNOSTIC (0132:641-655), running
    -- identically for both arms.
    v_ref := v_block ->> 'basis_ref';
    if nullif(btrim(coalesce(v_ref, '')), '') is null then
      raise exception 'a sandbox view body block cites no basis' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_block_basis_absent"}';
    end if;
    v_found := (v_ref = any(v_labels));
    if not v_found then
      raise exception 'this block''s basis_ref names no label of this view''s own basis' using errcode = 'CLR11',
        detail = jsonb_build_object('reason','sandbox_view_block_basis_unknown','basis_ref',v_ref)::text;
    end if;

    -- M5 -- THE PLACEHOLDER-ONLY ELEMENT LOOKUP. Runs AFTER the label check above, using the SAME
    -- per-label walk 0132's own exact-derivation loop already uses (0132:660-664) rather than a new
    -- lookup idiom. TWO checks, and only two:
    --   (1) the cited basis element's OWN kind must be 'preview_cell' -- a freeform_read basis has
    --       no single numeric value to substitute.
    --   (2) the resolved cell's cell_status must be 'ok' -- D3's MINT-TIME door (its render-time
    --       mirror is layoutSandbox's own refusal).
    -- IT DOES NOT CHECK DEFINITION-BACKING, and that omission is RULED, not forgotten (SS1's
    -- asymmetry sentence / BL-5): a stage-(a) placeholder MAY cite any 'ok' preview cell. The
    -- definition-backed requirement belongs to a stage-(b) `cell` AST NODE and is raised by
    -- _validate_metric_node_v2 / _metric_eval_node_v2 -- different functions, different moment.
    if v_kind = 'placeholder' then
      v_basis_elem := null;
      for v_basis_elem in select * from jsonb_array_elements(p_basis) loop
        exit when v_basis_elem ->> 'label' = v_ref;
      end loop;
      if (v_basis_elem ->> 'kind') is distinct from 'preview_cell' then
        raise exception 'a placeholder block must cite a preview-cell basis element' using errcode = 'CLR10',
          detail = jsonb_build_object('reason','sandbox_placeholder_basis_not_cell','basis_ref',v_ref)::text;
      end if;
      select cell_status into v_cell_status from clara.metric_cells
        where id = (v_basis_elem ->> 'id')::uuid and firm_id = p_firm;
      if v_cell_status is distinct from 'ok' then
        raise exception 'a placeholder block must cite a cell that evaluated ok' using errcode = 'CLR10',
          detail = jsonb_build_object('reason','sandbox_placeholder_cell_not_ok','basis_ref',v_ref,
            'cell_status',v_cell_status)::text;
      end if;
    end if;

    if not (v_ref = any(v_used_labels)) then
      v_used_labels := v_used_labels || v_ref;
    end if;
  end loop;

  -- The EXACT per-basis-kind derivation -- UNCHANGED (0132:657-700). SS2.3's PD-1: this loop keys
  -- off the BASIS element's kind, never the citing BLOCK's kind, so a placeholder block citing a
  -- preview_cell basis folds in through this same path with zero new logic.
  foreach v_ref in array v_used_labels loop
    v_basis_elem := null;
    for v_basis_elem in select * from jsonb_array_elements(p_basis) loop
      exit when v_basis_elem ->> 'label' = v_ref;
    end loop;
    v_basis_kind := v_basis_elem ->> 'kind';

    if v_basis_kind = 'preview_cell' then
      select client_id into v_preview_client from clara.metric_cells
        where id = (v_basis_elem ->> 'id')::uuid and firm_id = p_firm;
      v_client_set := v_client_set || v_preview_client;

    elsif v_basis_kind = 'freeform_read' then
      select scope, client_scope into v_fr_scope, v_fr_client_scope
        from clara.freeform_read_log where id = (v_basis_elem ->> 'id')::uuid and firm_id = p_firm;
      if v_fr_scope = 'client' then
        if v_fr_client_scope is null then
          raise exception 'a client-scoped freeform read carries no client' using errcode = 'CLR11',
            detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_ref)::text;
        end if;
        v_client_set := v_client_set || v_fr_client_scope;
      elsif v_fr_scope = 'firm' then
        v_uses_firm_closure := true;
        select array_agg(id) into v_firm_roster from clara.clients where firm_id = p_firm;
        v_client_set := v_client_set || coalesce(v_firm_roster, '{}'::uuid[]);
      else
        raise exception 'a cross-client named basis cannot be resolved until F-A6 v2 lands' using errcode = 'CLR11',
          detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_ref,
            'note','cross-client named reads are F-A6 v2''s own verb, a separate dependency (Annex K)')::text;
      end if;
    end if;
  end loop;

  select array_agg(distinct c) into v_client_set from unnest(v_client_set) c where c is not null;
  if coalesce(array_length(v_client_set, 1), 0) = 0 then
    raise exception 'the derived client set is empty' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_view_client_set_empty"}';
  end if;
  -- NT-1: captured BEFORE any widening, so a caller can assert the real per-basis-kind claim.
  v_client_set_exact := v_client_set;

  -- (iii) THE FAIL-SAFE INTERIM, NOW GENUINELY CONDITIONAL. 0132 widened on EVERY body because
  -- every block kind it admitted was free text; a placeholder-only body carries none, so the exact
  -- derivation now survives to the returned client_set. Coverage still only ever WIDENS.
  if v_has_free_text then
    v_uses_firm_closure := true;
    select array_agg(id) into v_firm_all from clara.clients where firm_id = p_firm;
    v_client_set := coalesce(v_firm_all, '{}'::uuid[]);
    if coalesce(array_length(v_client_set, 1), 0) = 0 then
      raise exception 'the derived client set is empty' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_client_set_empty"}';
    end if;
  end if;

  return jsonb_build_object('client_set', to_jsonb(v_client_set),
    'client_set_basis', case when v_uses_firm_closure then 'firm_closure' else 'exact' end,
    'client_set_exact', to_jsonb(v_client_set_exact));
end $$;
revoke all on function clara._sandbox_client_set(uuid,jsonb,jsonb) from public;

-- =====================================================================================
-- SECTION 2 -- STAGE (a): the payload's pinned `cells` pre-join (design SS2.4, S46, M11/CD-13).
--
-- THE JOIN KEY IS THE EXACT id RECORDED IN THE MINTED sandbox_views.basis ARRAY -- never a "latest
-- cell for this definition" re-lookup, never a re-run of any part of _sandbox_client_set. Because
-- a metric_cells row is permanently immutable (S15) and `basis` is frozen at mint (0132:277-280),
-- this join reproduces byte-identically whatever existed at mint, at any later render time: no
-- lock, no as-of column, no new mechanism. That is what resolves D1/CD-2 -- pinned at MINT,
-- resolved LAZILY at RENDER, both true at once.
--
-- THIS IS THE ONLY LAWFUL DOOR TO A CELL'S VALUE FOR THE RENDER WORKER. clara_runtime holds no
-- table grant on clara.metric_cells anywhere in 0058-0061 (S42) and clara.get_context_pack refuses
-- to return cell payload fields, so widening this security-definer function is the whole mechanism
-- -- exactly the pattern 0132:940-945 used for the pinned watermark text.
--
-- M11/CD-13 -- CITED LABELS ONLY. The join is restricted to labels a `placeholder` block ACTUALLY
-- cites, never every preview_cell basis element the view happens to carry: a cell cited only by a
-- text block (for provenance) is never substituted, so an entry for it is dead-weight surface that
-- would also feed the renderer's malformed-shape check something it can never reach. B2.3 forces
-- exactly this shape.
-- =====================================================================================
create or replace function clara.sandbox_export_payload(p_export uuid, p_worker text)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare e record; v record; v_watermark jsonb;
begin
  select * into e from clara.sandbox_exports
    where id = p_export and state = 'running' and claimed_by = p_worker and lease_expires_at >= now();
  if not found then
    raise exception 'this worker does not hold the lease on this sandbox export' using errcode = 'CLR43',
      detail = '{"reason":"sandbox_export_lease_not_held"}';
  end if;
  select * into v from clara.sandbox_views where id = e.sandbox_view_id;
  select watermark into v_watermark from clara.watermark_policy_versions
    where id = e.watermark_policy_version_id;
  return jsonb_build_object('sandbox_export_id', e.id, 'firm_id', e.firm_id,
    'sandbox_view_id', e.sandbox_view_id, 'body', v.body, 'body_sha256', v.body_sha256,
    'locale', e.locale, 'watermark_policy_version_id', e.watermark_policy_version_id,
    'watermark', v_watermark,
    'cells', (
      select coalesce(jsonb_object_agg(b.label, jsonb_build_object(
               'cell_id', b.id, 'cell_status', mc.cell_status, 'displayed_text', mc.displayed_text
             )), '{}'::jsonb)
        from jsonb_to_recordset(v.basis) as b(label text, kind text, id uuid)
        join clara.metric_cells mc on mc.id = b.id and mc.firm_id = e.firm_id
       where b.kind = 'preview_cell'
         and b.label in (
           select blk ->> 'basis_ref' from jsonb_array_elements(v.body -> 'blocks') blk
            where blk ->> 'kind' = 'placeholder'
         )
    ));
end
$$;

-- =====================================================================================
-- SECTION 3 -- BL-1: the TWELFTH PRIMITIVE. An ALTER, not a plain INSERT.
--
-- clara.metric_primitives.primitive_key carries an INLINE, UNNAMED CHECK closed to eleven literals
-- (0058:67-69). Inserting 'cell' against it as-is fails outright, which is why this build is NOT
-- DDL-free. The constraint's NAME IS READ FROM THE LIVE CATALOG, never guessed: Postgres's default
-- auto-naming for an unnamed single-column CHECK is predictable, but a guessed name is a name-read
-- standing in for the thing itself (review law 3), and a wrong guess would drop nothing and then
-- fail on the re-add.
--
-- EXTEND-ONLY, 11 -> 12. 0059's own tail census (`if n<>11`) stays exactly as printed forever --
-- migration files are immutable. This file REPRODUCES that census shape at its own tail with the
-- count updated to 12; it never edits 0059.
-- =====================================================================================
do $prim$
declare v_conname text;
begin
  select conname into v_conname from pg_constraint
   where conrelid = 'clara.metric_primitives'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%primitive_key%';
  if v_conname is null then
    raise exception 'card1 seam: the primitive_key CHECK vanished between prestate and here' using errcode = 'CLR10';
  end if;
  execute format('alter table clara.metric_primitives drop constraint %I', v_conname);
  raise notice 'card1 seam: dropped metric_primitives CHECK %, re-adding widened to twelve literals', v_conname;
end
$prim$;
alter table clara.metric_primitives add constraint metric_primitives_primitive_key_check
  check (primitive_key in ('measure','sum','average','lag','subtract','divide',
    'days_in_period','percent_change','multiply','constant','count','cell'));
insert into clara.metric_primitives(primitive_key, structural_integer_fields)
  values ('cell', '{}');

-- =====================================================================================
-- SECTION 4 -- STAGE (b): the v2 AST vocabulary (design SS3.1, M6, M7, BL-5, N5).
--
-- WHY v1's FUNCTIONS ARE NOT EDITED IN PLACE, MECHANICALLY RATHER THAN BY CONVENTION.
-- clara._validate_metric_node_v1 and clara._metric_eval_node_v1 are registered members of the
-- ('evaluate_metric', 1) closure minted at 0059:246. clara.verify_evaluator_freeze() -- invoked by
-- scripts/migrate.mjs between EVERY migration body and its commit -- re-derives
-- sha256(pg_get_functiondef(member_signature)) LIVE from the catalog for every member and refuses
-- on any mismatch. A `create or replace` of either would fail this file's own apply, not merely a
-- review. Battery cell B5.5 forces that refusal rather than asserting it.
--
-- THE BODIES BELOW ARE v1's, RETARGETED -- and they were derived by a MECHANICAL, count-asserted
-- textual transform of 0059's live text rather than retyped, because a hand-copy of a 24KB
-- minified evaluator is exactly where a silent arithmetic drift enters. What changed, in full:
--   * the signature (p_firm/p_client added; see the note below on parameter ORDER),
--   * the SEVEN textual recursive call sites in each body, retargeted _v1 -> _v2 (M8: seven
--     TEXTUAL sites, five node-kind GROUPS -- both countings are correct, and it is the seven that
--     a builder must not miss: lag's tail-call, average-of's loop call, sum/average-terms' loop
--     call, percent_change's prior and current, and divide/subtract/multiply's shared num-or-left
--     and den-or-right),
--   * one new `elsif k='cell'` branch in each,
--   * the extra local declarations that branch needs.
-- NOTHING ELSE MOVED. Battery cell B5.8 proves that behaviourally rather than by inspection: every
-- one of the estate's ten canonical definition ASTs is run through BOTH v1 and v2 and the results
-- must be identical -- a differential that a transcription drift cannot survive.
--
-- PARAMETER ORDER, a forced deviation from the design's stated signature. The design writes
-- `_validate_metric_node_v2(n jsonb, d int default 1, p_firm uuid, p_client uuid)`; PostgreSQL
-- refuses a non-defaulted parameter after a defaulted one, so that signature is not creatable.
-- The minimal legal correction keeps every name and type and moves the two new parameters BEFORE
-- the defaulted depth counter.
--
-- CD-7/N5 -- WHY THE SIGNATURE GENUINELY WIDENS. None of v1's eleven primitives reads firm-scoped
-- OPERATIONAL data: metric_constants and edge_policy_sets are firm-NULLABLE CATALOG tables, read
-- with no firm predicate, and that is safe because a PK-keyed catalog has no tenant to leak
-- across. `cell` is the first primitive that reads an RLS-forced operational row, and
-- clara.metric_cells' own owner policy is `using(true)` (0058:329) -- so an unscoped lookup inside
-- a definer body would see every firm's rows, the exact 0083:102-108 class both this design and
-- 0132 already guard against. Hence EQUALITY on both firm_id and client_id, never
-- `is not distinct from`, and never a lookup that omits either. The metric_units read two lines
-- later carries NO firm predicate and that is deliberate and safe for the catalog reason above.
--
-- BL-4/CD-9 -- THE DOCUMENT TAG DOES NOT MOVE. `clara.metric/v1` and
-- `clara.metric-composition-inputs/v1` stay exactly as they are: the GRAMMAR widens by one closed
-- node kind, the DOCUMENT FORMAT does not. Vocabulary identity is carried by the EVALUATOR VERSION
-- (evaluator_name, version) -- the estate's own identity model (S21) -- never by a format string.
-- =====================================================================================
create function clara._validate_metric_node_v2(n jsonb,p_firm uuid,p_client uuid,d int default 1)returns jsonb language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare k text;a jsonb;b jsonb;r jsonb;x jsonb;first boolean:=true;nodes int:=1;leaves int:=0;lagmax int:=0;cells int:=0;po int:=0;cp int;dp int;np int;cnt int;v_cell record;v_temp text;
begin if p_firm is null or p_client is null then raise exception 'metric v2 validation needs a firm and client scope'using errcode='CLR10',detail='{"reason":"scope_mismatch","class":"v2_scope","fix":"pass the composing firm and client -- a cell reference is firm-scoped operational data"}';end if;if n is null or jsonb_typeof(n)<>'object'or not(n?'node')or jsonb_typeof(n->'node')<>'string'or nullif(n->>'node','')is null then raise exception 'metric node malformed'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"use the closed allowed node fields and supply a nonblank node"}';end if;k:=n->>'node';if k='literal'or n?'value'then raise exception 'numeric literal forbidden'using errcode='CLR10',detail='{"reason":"numeric_literal_forbidden","fix":"use an approved versioned constant"}';end if;if d>12 then raise exception 'metric cost exceeded'using errcode='CLR10',detail='{"reason":"cost_exceeded","class":"depth","limit":12,"fix":"reduce metric nesting to at most 12 levels"}';end if;
 if k='measure'then if exists(select 1 from jsonb_object_keys(n)q where q<>all(array['node','set','aspect','present_as','scope']))or not(n?'set')or jsonb_typeof(n->'set')<>'object'or not(n?'aspect')or jsonb_typeof(n->'aspect')<>'string'or not(n?'scope')or jsonb_typeof(n->'scope')<>'object'or(n?'present_as'and jsonb_typeof(n->'present_as')<>'string')or n#>>'{set,kind}'<>'account_set'or nullif(n#>>'{set,key}','')is null or exists(select 1 from jsonb_object_keys(n->'set')q where q<>all(array['key','kind']))or exists(select 1 from jsonb_object_keys(n->'scope')q where q<>all(array['period','entity','basis']))or not(n->'scope'?'period')or jsonb_typeof(n#>'{scope,period}')<>'string'or not(n->'scope'?'entity')or jsonb_typeof(n#>'{scope,entity}')<>'string'or not(n->'scope'?'basis')or jsonb_typeof(n#>'{scope,basis}')<>'string'then raise exception 'measure schema closed'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"remove fields outside the closed measure schema; sign presentation is leaf-only"}';end if;if n#>>'{scope,entity}'<>'$CLIENT'or n#>>'{scope,basis}'<>'accrual'or n#>>'{scope,period}'!~'^\$P(0|-[1-9][0-9]?)$'or n->>'aspect'not in('period_movement','closing_balance')or coalesce(n->>'present_as','natural')not in('natural','positive_expense','positive_revenue')then raise exception 'measure scope mismatch'using errcode='CLR10',detail='{"reason":"scope_mismatch","fix":"use a single client entity, accrual basis and bound period"}';end if;po:=case when n#>>'{scope,period}'='$P0'then 0 else -substring(n#>>'{scope,period}'from 4)::int end;r:=jsonb_build_object('cp',1,'dp',0,'np',0,'temp',case when n->>'aspect'='closing_balance'then'point_in_time'else'flow'end,'po',po,'nodes',1,'leaves',1,'lag',abs(po));
 elsif k='constant'then if exists(select 1 from jsonb_object_keys(n)q where q<>all(array['node','key']))or not(n?'key')or jsonb_typeof(n->'key')<>'string'or nullif(n->>'key','')is null then raise exception 'constant schema closed'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"use only node and key"}';end if;select min(currency_power),min(days_power),min(count_power),count(distinct concat_ws(':',currency_power,days_power,count_power))into cp,dp,np,cnt from clara.metric_constants where constant_key=n->>'key';if cnt<>1 then raise exception 'constant absent or ambiguous'using errcode='CLR10',detail='{"reason":"scope_mismatch","fix":"publish one versioned constant dimension"}';end if;r:=jsonb_build_object('cp',cp,'dp',dp,'np',np,'temp','flow','po',0,'nodes',1,'leaves',0,'lag',0);
 elsif k='days_in_period'then if exists(select 1 from jsonb_object_keys(n)q where q<>'node')then raise exception 'days schema closed'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"use only node"}';end if;r:='{"cp":0,"dp":1,"np":0,"temp":"flow","po":0,"nodes":1,"leaves":0,"lag":0}';
 elsif k='count'then if exists(select 1 from jsonb_object_keys(n)q where q<>all(array['node','source','scope','domain','item_kind','operation_kind']))or not(n?'source')or jsonb_typeof(n->'source')<>'string'or not(n?'scope')or jsonb_typeof(n->'scope')<>'object'or exists(select 1 from jsonb_object_keys(n->'scope')q where q<>all(array['period','entity','basis']))or not(n->'scope'?'period')or jsonb_typeof(n#>'{scope,period}')<>'string'or not(n->'scope'?'entity')or jsonb_typeof(n#>'{scope,entity}')<>'string'or not(n->'scope'?'basis')or jsonb_typeof(n#>'{scope,basis}')<>'string'or(n?'domain'and jsonb_typeof(n->'domain')<>'string')or(n?'item_kind'and jsonb_typeof(n->'item_kind')<>'string')or(n?'operation_kind'and jsonb_typeof(n->'operation_kind')<>'string')or n->>'source'not in('open_items','allocations','contributions','samples')or n#>>'{scope,entity}'<>'$CLIENT'or n#>>'{scope,basis}'<>'accrual'or n#>>'{scope,period}'!~'^\$P(0|-[1-9][0-9]?)$'or(n?'domain'and n->>'source'not in('open_items','allocations'))or(n?'item_kind'and n->>'source'<>'open_items')or(n?'operation_kind'and n->>'source'<>'allocations')then raise exception 'count scope mismatch'using errcode='CLR10',detail='{"reason":"scope_mismatch","fix":"use a closed immutable-fact source and client scope"}';end if;po:=case when n#>>'{scope,period}'='$P0'then 0 else -substring(n#>>'{scope,period}'from 4)::int end;r:=jsonb_build_object('cp',0,'dp',0,'np',1,'temp','flow','po',po,'nodes',1,'leaves',0,'lag',abs(po));
 elsif k='lag'then if exists(select 1 from jsonb_object_keys(n)q where q<>all(array['node','periods','of']))or not(n?'periods')or jsonb_typeof(n->'periods')<>'number'or not(n?'of')or jsonb_typeof(n->'of')<>'object'or(n->>'periods')::numeric<>trunc((n->>'periods')::numeric)or(n->>'periods')::int not between 1 and 24 then raise exception 'metric lag cost exceeded'using errcode='CLR10',detail='{"reason":"cost_exceeded","class":"lag","limit":24,"fix":"reduce the largest lag to at most 24 periods"}';end if;a:=clara._validate_metric_node_v2(n->'of',p_firm,p_client,d+1);if coalesce((a->>'cells')::int,0)>0 then raise exception 'a cell operand may not sit beneath a period shift'using errcode='CLR10',detail='{"reason":"temporality_mismatch","class":"cross_period_cell","fix":"a cell node carries its own whole-period-set value and IS the composition root''s reporting moment; lag a raw measure instead, or cite a cell minted for the period you actually want"}';end if;lagmax:=(a->>'lag')::int+(n->>'periods')::int;r:=a||jsonb_build_object('po',(a->>'po')::int-(n->>'periods')::int,'nodes',(a->>'nodes')::int+1,'lag',lagmax);
 elsif k='average'and n?'of'then if exists(select 1 from jsonb_object_keys(n)q where q<>all(array['node','of']))or jsonb_typeof(n->'of')<>'object'then raise exception 'average schema closed'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"use only node and an object operand"}';end if;a:=clara._validate_metric_node_v2(n->'of',p_firm,p_client,d+1);if a->>'temp'<>'point_in_time'then raise exception 'average temporality mismatch'using errcode='CLR10',detail='{"reason":"temporality_mismatch","fix":"average(of) samples a point-in-time value"}';end if;r:=a||jsonb_build_object('temp','period_average','nodes',(a->>'nodes')::int+1);
 elsif k in('sum','average')then if exists(select 1 from jsonb_object_keys(n)q where q<>all(array['node','terms']))or jsonb_typeof(n->'terms')<>'array'or jsonb_array_length(n->'terms')<1 then raise exception 'aggregate schema closed'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"remove non-node aggregate fields such as present_as; sign presentation is allowed only at a measure leaf, and use a non-empty terms array"}';end if;for x in select value from jsonb_array_elements(n->'terms')loop a:=clara._validate_metric_node_v2(x,p_firm,p_client,d+1);if not first and row(r->>'cp',r->>'dp',r->>'np')<>row(a->>'cp',a->>'dp',a->>'np')then raise exception 'dimension mismatch'using errcode='CLR10',detail='{"reason":"dimension_mismatch","fix":"use matching operands"}';end if;if not first and(r->>'temp'<>a->>'temp'or r->>'po'<>a->>'po')then raise exception 'temporality mismatch'using errcode='CLR10',detail='{"reason":"temporality_mismatch","fix":"align periods and wrap stock legs in average"}';end if;if first then r:=a;first:=false;end if;nodes:=nodes+(a->>'nodes')::int;leaves:=leaves+(a->>'leaves')::int;lagmax:=greatest(lagmax,(a->>'lag')::int);cells:=cells+coalesce((a->>'cells')::int,0);end loop;r:=r||jsonb_build_object('temp',case when k='average'then'period_average'else r->>'temp'end,'nodes',nodes,'leaves',leaves,'lag',lagmax)||case when cells>0 then jsonb_build_object('cells',cells) else '{}'::jsonb end;
 elsif k in('divide','subtract','multiply','percent_change')then if k='percent_change'then if exists(select 1 from jsonb_object_keys(n)q where q<>all(array['node','current','prior']))or not(n?'current')or jsonb_typeof(n->'current')<>'object'or not(n?'prior')or jsonb_typeof(n->'prior')<>'object'then raise exception 'binary schema closed'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"use required object operands current and prior"}';end if;a:=clara._validate_metric_node_v2(n->'current',p_firm,p_client,d+1);b:=clara._validate_metric_node_v2(n->'prior',p_firm,p_client,d+1);else if exists(select 1 from jsonb_object_keys(n)q where q<>all(case when k='divide'then array['node','num','den']else array['node','left','right']end))or(k='divide'and(not(n?'num')or jsonb_typeof(n->'num')<>'object'or not(n?'den')or jsonb_typeof(n->'den')<>'object'))or(k<>'divide'and(not(n?'left')or jsonb_typeof(n->'left')<>'object'or not(n?'right')or jsonb_typeof(n->'right')<>'object'))then raise exception 'binary schema closed'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"supply both required object operands and remove fields outside the closed binary schema"}';end if;a:=clara._validate_metric_node_v2(case when k='divide'then n->'num'else n->'left'end,p_firm,p_client,d+1);b:=clara._validate_metric_node_v2(case when k='divide'then n->'den'else n->'right'end,p_firm,p_client,d+1);end if;if k='subtract'and row(a->>'cp',a->>'dp',a->>'np',a->>'temp',a->>'po')<>row(b->>'cp',b->>'dp',b->>'np',b->>'temp',b->>'po')then raise exception 'subtract mismatch'using errcode='CLR10',detail='{"reason":"dimension_mismatch","fix":"use matching operands at the same period and temporality"}';end if;if k='percent_change'and row(a->>'cp',a->>'dp',a->>'np')<>row(b->>'cp',b->>'dp',b->>'np')then raise exception 'percent-change dimension mismatch'using errcode='CLR10',detail='{"reason":"dimension_mismatch","fix":"compare like with like: percent_change subtracts its prior from its current, so both operands must carry the same dimension"}';end if;if k in('divide','percent_change')and a->>'temp'='point_in_time'and b->>'temp'='flow'then raise exception 'stock over flow'using errcode='CLR10',detail='{"reason":"stock_over_flow","fix":"average(...) the numerator, then multiply by days_in_period"}';end if;if k in('divide','percent_change')and a->>'temp'<>b->>'temp'and not((a->>'temp'='period_average'and b->>'temp'='flow')or(a->>'temp'='flow'and b->>'temp'='period_average'))then raise exception 'temporality mismatch'using errcode='CLR10',detail='{"reason":"temporality_mismatch","fix":"align operand temporalities or average a point-in-time numerator against the flow"}';end if;if k='multiply'and not((a->>'temp'=b->>'temp')or(a->>'temp'='flow'and b->>'temp'='period_average')or(a->>'temp'='period_average'and b->>'temp'='flow'))then raise exception 'temporality mismatch'using errcode='CLR10',detail='{"reason":"temporality_mismatch","fix":"multiply values with a compatible period temporality"}';end if;cp:=case when k in('divide','percent_change')then(a->>'cp')::int-(b->>'cp')::int when k='multiply'then(a->>'cp')::int+(b->>'cp')::int else(a->>'cp')::int end;dp:=case when k in('divide','percent_change')then(a->>'dp')::int-(b->>'dp')::int when k='multiply'then(a->>'dp')::int+(b->>'dp')::int else(a->>'dp')::int end;np:=case when k in('divide','percent_change')then(a->>'np')::int-(b->>'np')::int when k='multiply'then(a->>'np')::int+(b->>'np')::int else(a->>'np')::int end;if abs(cp)>1 then raise exception 'dimension overflow'using errcode='CLR10',detail='{"reason":"dimension_overflow","fix":"do not multiply currency by currency"}';end if;r:=jsonb_build_object('cp',cp,'dp',dp,'np',np,'temp',case when k='subtract'then a->>'temp'when k='multiply'and a->>'temp'=b->>'temp'then a->>'temp'when k='divide'and a->>'temp'=b->>'temp'then a->>'temp'else'flow'end,'po',(a->>'po')::int,'nodes',(a->>'nodes')::int+(b->>'nodes')::int+1,'leaves',(a->>'leaves')::int+(b->>'leaves')::int,'lag',greatest((a->>'lag')::int,(b->>'lag')::int))||case when coalesce((a->>'cells')::int,0)+coalesce((b->>'cells')::int,0)>0 then jsonb_build_object('cells',coalesce((a->>'cells')::int,0)+coalesce((b->>'cells')::int,0))else'{}'::jsonb end;
 elsif k='cell'then if exists(select 1 from jsonb_object_keys(n)q where q<>all(array['node','cell_id']))or not(n?'cell_id')or jsonb_typeof(n->'cell_id')<>'string'or n->>'cell_id'!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'then raise exception 'cell schema closed'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"use only node and a well-formed uuid cell_id"}';end if;select mc.unit_key,mc.definition_version_id,mc.cell_status into v_cell from clara.metric_cells mc where mc.id=(n->>'cell_id')::uuid and mc.firm_id=p_firm and mc.client_id=p_client;if not found then raise exception 'metric cell reference does not resolve in this firm and client'using errcode='CLR11',detail='{"reason":"metric_cell_reference_unknown","fix":"cite a metric cell minted for this firm and this client"}';end if;if v_cell.definition_version_id is null then raise exception 'a cell operand must be definition-backed'using errcode='CLR10',detail='{"reason":"metric_cell_reference_not_definition_backed","fix":"cite a canonical, definition-backed cell -- a preview-composed cell is another composition''s own output, not a raw-books fact"}';end if;if v_cell.cell_status is distinct from'ok'then raise exception 'a cell operand must have evaluated ok'using errcode='CLR10',detail=jsonb_build_object('reason','metric_cell_reference_not_ok','cell_status',v_cell.cell_status,'fix','cite a cell whose own evaluation succeeded rather than propagating an undefined, absent or refused input')::text;end if;select mu.currency_power,mu.days_power,mu.count_power,dv.temporality_key into cp,dp,np,v_temp from clara.metric_units mu,clara.metric_definition_versions dv where mu.unit_key=v_cell.unit_key and dv.id=v_cell.definition_version_id;if v_temp is null then raise exception 'a cell operand''s unit or temporality is not registered'using errcode='CLR10',detail='{"reason":"declaration_mismatch","fix":"the cited cell names a unit or definition version this catalog does not carry"}';end if;r:=jsonb_build_object('cp',cp,'dp',dp,'np',np,'temp',v_temp,'po',0,'nodes',1,'leaves',0,'lag',0,'cells',1);
 else raise exception 'metric primitive unknown'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"use a registered closed primitive"}';end if;if(r->>'nodes')::int>64 or(r->>'leaves')::int>32 or(r->>'lag')::int>24 then raise exception 'metric cost exceeded'using errcode='CLR10',detail=jsonb_build_object('reason','cost_exceeded','class',case when(r->>'nodes')::int>64 then'nodes'when(r->>'leaves')::int>32 then'leaves'else'lag'end,'node_limit',64,'measure_limit',32,'lag_limit',24,'fix',case when(r->>'nodes')::int>64 then'reduce the AST to at most 64 nodes'when(r->>'leaves')::int>32 then'reduce the AST to at most 32 measure leaves'else'reduce the largest lag to at most 24 periods'end)::text;end if;return r;end$$;
revoke all on function clara._validate_metric_node_v2(jsonb,uuid,uuid,integer) from public;

create function clara.validate_metric_ast_v2(a jsonb,p_firm uuid,p_client uuid)returns jsonb language plpgsql stable security definer set search_path=clara,pg_temp as $$declare r jsonb;u record;begin if a is null or jsonb_typeof(a)<>'object'or exists(select 1 from jsonb_object_keys(a)q where q<>all(array['ast','unit','temporality','result_scale','edge_policy_set','root']))or not(a?'ast')or jsonb_typeof(a->'ast')<>'string'or a->>'ast'<>'clara.metric/v1'or not(a?'unit')or jsonb_typeof(a->'unit')<>'string'or not(a?'temporality')or jsonb_typeof(a->'temporality')<>'string'or not(a?'result_scale')or jsonb_typeof(a->'result_scale')<>'number'or not(a?'edge_policy_set')or jsonb_typeof(a->'edge_policy_set')<>'string'or nullif(a->>'edge_policy_set','')is null or not(a?'root')or jsonb_typeof(a->'root')<>'object'then raise exception 'metric top-level schema closed'using errcode='CLR10',detail='{"reason":"unknown_field","fix":"supply exactly the six required clara.metric/v1 fields"}';end if;if jsonb_typeof(a->'result_scale')<>'number'or(a->>'result_scale')::numeric<>trunc((a->>'result_scale')::numeric)or(a->>'result_scale')::int not between 0 and 12 then raise exception 'result scale invalid'using errcode='CLR10',detail='{"reason":"cost_exceeded","class":"result_scale","limit":12,"fix":"set result_scale to an integer from 0 through 12"}';end if;if not exists(select 1 from clara.edge_policy_sets where policy_set_key=a->>'edge_policy_set'and firm_id is null)then raise exception 'edge policy absent'using errcode='CLR10',detail='{"reason":"scope_mismatch","fix":"use an effective versioned edge-policy set"}';end if;r:=clara._validate_metric_node_v2(a->'root',p_firm,p_client,1);select * into u from clara.metric_units where unit_key=case a->>'unit'when'currency'then'money'else a->>'unit'end;if u.unit_key is null or row(u.currency_power,u.days_power,u.count_power)<>row((r->>'cp')::smallint,(r->>'dp')::smallint,(r->>'np')::smallint)or a->>'temporality'<>r->>'temp'then raise exception 'metric declaration mismatch'using errcode='CLR10',detail='{"reason":"declaration_mismatch","fix":"match the declared unit and temporality to the inferred contract"}';end if;return r||jsonb_build_object('unit',u.unit_key,'result_scale',(a->>'result_scale')::int);end$$;
revoke all on function clara.validate_metric_ast_v2(jsonb,uuid,uuid) from public;

-- M6 -- THE CONTEXT-MATCH RULING, and why it lives at EVALUATION time. A `cell` operand must match
-- the composing context on TWO axes: the cited cell's own metric_cell_periods must be the EXACT
-- SET the composing formula's metric_evaluation_context_periods binds (compared as sets, order
-- independent), and the cited cell's frozen books_watermark must equal the composing snapshot's.
-- Neither is checkable in the validator, which has no period or snapshot argument -- exactly as
-- v1's own validator never sees them either. A mismatch on either axis refuses
-- metric_cell_context_mismatch: a formula may not silently splice facts computed against different
-- books-freshness or different reporting windows.
--
-- WHY THAT IS SUFFICIENT WITHOUT A CROSS-PERIOD PRIMITIVE: in-context time comparison already
-- exists in the closed grammar via lag / percent_change. A formula that wants "this period versus
-- three months ago" uses lag over a RAW measure; a `cell` node's whole purpose is to let a NEW
-- formula read an ALREADY-COMPUTED fact from the SAME reporting moment. Deliberate
-- cross-period/cross-context composition is a NAMED, UNBUILT extension point (design SS6 item 4).
--
-- M7/CD-12 -- PROVENANCE IS CITED BY ID, NEVER INLINED. A cell node contributes the EMPTY array to
-- account_set_version_ids / constant_version_ids / entry_ids / document_ids; the cited cell's own
-- provenance stays NORMALIZED behind its id in inputs.input_values.cell_id. A reader walks
-- composing-cell -> cell_id -> cited cell -> its own child provenance tables. That also removes a
-- key-collision risk in _tf_metric_cell_integrity's re-derivation, and it removes it STRUCTURALLY
-- rather than by relying on BL-5's wall being present.
--
-- M7 -- TEMPORALITY IS REAL, NEVER HARDCODED. The cited cell's temporality is whatever its OWN
-- metric_definition_versions.temporality_key says. A closing_balance-aspect measure composed into a
-- canonical definition is point_in_time, and hardcoding 'flow' would mis-declare it and corrupt
-- every dimensional-algebra check downstream. `po` IS 0, and that is DERIVED rather than assumed:
-- given the period-set equality M6 enforces at this same door, the cited cell's periods necessarily
-- align with the composing context's root period. Stated here so a future loosening of M6 does not
-- silently inherit the assumption unexamined.
--
-- AND THAT DERIVATION HOLDS ONLY AT THE ROOT -- which is the whole reason for the two guards below.
-- M6's period-set equality compares the cell's periods to the CONTEXT's whole set. It says nothing
-- about WHICH period the evaluator is currently standing on, and `lag` moves exactly that: it shifts
-- `target` and recurses. A `cell` beneath a lag would therefore pass M6, ignore the shifted target,
-- return its stored whole-set value, and still report po = 0 -- a period-MISLABELLED figure ("one
-- period before May" carrying May's number) that is deterministic, reproducible and WRONG, and that
-- a stage-(a) placeholder could then cite into a rendered PDF. Found by adversarial review on a live
-- rig through the real wake door, not by reading; the paragraph above had asserted the safe premise
-- without noticing the operator that breaks it.
--
-- THE GUARDS ARE TWO, AND THEY ARE DELIBERATELY NOT THE SAME MECHANISM:
--   1. STRUCTURAL, in _validate_metric_node_v2 -- the node contract now carries a bottom-up `cells`
--      count, and the lag branch REFUSES when its `of` subtree contains one. This refuses before a
--      context or an op receipt exists, matching how the sibling cross-period-over-cell shapes
--      already refuse, and it covers a cell at ANY depth beneath the lag rather than only directly
--      under it. THE KEY IS OMITTED WHEN THE COUNT IS ZERO, which is load-bearing rather than tidy:
--      B5.8 diffs v1's contract against v2's on every canonical cell-free AST, at BOTH the node door
--      and the top-level one, and that is how a transcription drift in a 24KB retyped body gets
--      caught. A `cells: 0` v1 has no counterpart for makes all ten definitions differ on a field
--      that carries no meaning there -- measured, it was the SOLE difference. Emitting the key only
--      when it is positive keeps that differential byte-exact rather than teaching it to skip a
--      field, and absent reads as zero at every site that consumes the count.
--   2. BEHAVIOURAL, here -- the cell branch asserts it is standing on the context's OWN root period
--      (ordinal 0, which both v2 callers bind from p_period_ids[1]). This one is
--      MECHANISM-INDEPENDENT: it does not enumerate which operators shift, so a future primitive
--      that moves `target` inherits the refusal instead of quietly reopening this hole. A null root
--      lookup refuses too -- absence is not evidence.
-- Belt and braces on purpose: guard 1 is the typed, early, cheap refusal; guard 2 is the one that
-- cannot be outflanked by adding an operator. Neither weakens an existing check.
create function clara._metric_eval_node_v2(p_firm uuid,p_client uuid,p_snapshot uuid,p_context uuid,p_period uuid,n jsonb,p_allow_negative boolean,p_average_key text,p_as_of date default null)returns clara.metric_value_v1 language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare r clara.metric_value_v1;a clara.metric_value_v1;b clara.metric_value_v1;k text:=n->>'node';x jsonb;rp record;av record;cv record;av_id uuid;match_count int;live_ids uuid[];frozen_ids uuid[];actual_count int;bad_count int;target uuid:=p_period;shifts int:=0;i int;rows_n int;terms_n int:=0;g numeric;h numeric;t numeric;sample_on date;sample_n int:=0;amount numeric;present text;source text;signs jsonb:='[]';operand_values jsonb:='[]';v_cell record;v_temp text;v_cp smallint;v_dp smallint;v_np smallint;v_snap_watermark text;v_cell_periods uuid[];v_ctx_periods uuid[];v_root_period uuid;
begin r.status:='ok';r.denominator:=1;r.account_set_version_ids:='{}';r.constant_version_ids:='{}';r.entry_ids:='{}';r.document_ids:='{}';r.inputs:='{}';if k in('measure','count')then shifts:=case when n#>>'{scope,period}'='$P0'then 0 else substring(n#>>'{scope,period}'from 4)::int end;elsif k='lag'then shifts:=(n->>'periods')::int;end if;if shifts>0 then for i in 1..shifts loop select p.* into rp from clara.metric_input_snapshot_periods sp join clara.reporting_periods p on p.id=sp.period_id and p.firm_id=sp.firm_id and p.client_id=sp.client_id where sp.snapshot_id=p_snapshot and sp.period_id=target and sp.client_id=p_client;if rp.id is null then target:=null;exit;elsif rp.grain='month'then select sp.period_id into target from clara.metric_input_snapshot_periods sp join clara.reporting_periods p on p.id=sp.period_id and p.firm_id=sp.firm_id and p.client_id=sp.client_id where sp.snapshot_id=p_snapshot and sp.client_id=p_client and p.grain='month'and sp.period_start=(rp.period_start-interval'1 month')::date;elsif rp.grain='fiscal_year'then select sp.period_id into target from clara.metric_input_snapshot_periods sp join clara.reporting_periods p on p.id=sp.period_id and p.firm_id=sp.firm_id and p.client_id=sp.client_id where sp.snapshot_id=p_snapshot and sp.client_id=p_client and p.grain='fiscal_year'and sp.period_end=rp.period_start-1;else target:=null;end if;if target is null or not exists(select 1 from clara.metric_evaluation_context_periods where context_id=p_context and period_id=target)then target:=null;exit;end if;end loop;if target is null then r.status:='absent';r.reason_key:='prior_period_absent';return r;end if;end if;select p.* into rp from clara.metric_input_snapshot_periods sp join clara.reporting_periods p on p.id=sp.period_id and p.firm_id=sp.firm_id and p.client_id=sp.client_id where sp.snapshot_id=p_snapshot and sp.period_id=target;if rp.id is null then r.status:='absent';r.reason_key:=case when shifts>0 then'prior_period_absent'else'absent'end;return r;end if;r.period_id:=target;
 if k='measure'then select min(v.id::text)::uuid,count(*) into av_id,match_count from clara.account_set_versions v join clara.account_sets s on s.id=v.account_set_id where s.firm_id=rp.firm_id and s.client_id=p_client and v.firm_id=rp.firm_id and v.client_id=p_client and s.set_key=n#>>'{set,key}'and v.state in('published','superseded')and v.effective_from<=rp.period_start and(v.effective_to is null or v.effective_to>=rp.period_start);if match_count=0 then r.status:='refused';r.reason_key:='account_set_resolution_absent';r.inputs:=jsonb_build_object('account_set_resolution',jsonb_build_object('set_key',n#>>'{set,key}','candidate_count',0,'period_id',target),'sign_normalizations',jsonb_build_array(coalesce(n->>'present_as','natural')),'input_values',jsonb_build_object('node','measure','period_id',target,'aspect',n->>'aspect','present_as',coalesce(n->>'present_as','natural'),'account_set_resolution',jsonb_build_object('set_key',n#>>'{set,key}','candidate_count',0,'period_id',target),'value',null));return r;elsif match_count>1 then r.status:='refused';r.reason_key:='account_set_resolution_ambiguous';r.inputs:=jsonb_build_object('account_set_resolution',jsonb_build_object('set_key',n#>>'{set,key}','candidate_count',match_count,'period_id',target),'sign_normalizations',jsonb_build_array(coalesce(n->>'present_as','natural')),'input_values',jsonb_build_object('node','measure','period_id',target,'aspect',n->>'aspect','present_as',coalesce(n->>'present_as','natural'),'account_set_resolution',jsonb_build_object('set_key',n#>>'{set,key}','candidate_count',match_count,'period_id',target),'value',null));return r;end if;select * into strict av from clara.account_set_versions where id=av_id;r.account_set_version_ids:=array[av.id];select coalesce(array_agg(m.account_id order by m.ordinal),'{}'),count(*)::int,count(*)filter(where m.ordinal<>m.ro-1 or m.ordinal<>m.ra-1)::int into frozen_ids,actual_count,bad_count from(select vm.account_id,vm.ordinal,row_number()over(order by vm.ordinal)ro,row_number()over(order by vm.account_id)ra from clara.account_set_version_members vm where vm.account_set_version_id=av.id and vm.firm_id=rp.firm_id and vm.client_id=p_client)m;r.inputs:=jsonb_build_object('account_set_resolution',jsonb_build_object('set_key',n#>>'{set,key}','version_id',av.id,'measured_count',actual_count,'ordinal_mismatch_count',bad_count,'stored_count',av.frozen_member_count,'state',av.state,'effective_from',av.effective_from,'effective_to',av.effective_to),'sign_normalizations',jsonb_build_array(coalesce(n->>'present_as','natural')),'input_values',jsonb_build_object('node','measure','period_id',target,'aspect',n->>'aspect','present_as',coalesce(n->>'present_as','natural'),'account_set_resolution',jsonb_build_object('set_key',n#>>'{set,key}','version_id',av.id,'measured_count',actual_count,'ordinal_mismatch_count',bad_count,'stored_count',av.frozen_member_count,'state',av.state,'effective_from',av.effective_from,'effective_to',av.effective_to),'value',null));live_ids:=clara._metric_selector_account_ids(p_client,av.selector);if live_ids is distinct from frozen_ids or bad_count<>0 or actual_count<>av.frozen_member_count or clara._hash(to_jsonb(frozen_ids))<>av.frozen_members_sha256 or sha256(convert_to(jsonb_build_object('schema','clara.account-set-version/v1','selector',av.selector,'zero_when_no_rows',av.zero_when_no_rows,'members',frozen_ids)::text,'UTF8'))<>av.content_sha256 then r.status:='refused';r.reason_key:='account_set_drift';return r;end if;if actual_count>512 then r.status:='refused';r.reason_key:='account_set_expansion';return r;end if;present:=coalesce(n->>'present_as','natural');if p_as_of is not null or n->>'aspect'='closing_balance'then sample_on:=coalesce(p_as_of,rp.period_end);select count(*),sum(case present when'natural'then case when s.account_type in('liability','equity','income')then-s.balance_cents else s.balance_cents end when'positive_expense'then s.balance_cents when'positive_revenue'then-s.balance_cents end)into rows_n,amount from clara.metric_input_snapshot_samples s join clara.account_set_version_members m on m.account_set_version_id=av.id and m.firm_id=rp.firm_id and m.client_id=p_client and m.account_id=s.account_id where s.snapshot_id=p_snapshot and s.firm_id=rp.firm_id and s.client_id=p_client and s.period_id=target and s.sample_date=sample_on;else select count(*),sum(case present when'natural'then case when c.account_type in('liability','equity','income')then-(c.debit_cents-c.credit_cents)else c.debit_cents-c.credit_cents end when'positive_expense'then c.debit_cents-c.credit_cents when'positive_revenue'then c.credit_cents-c.debit_cents end)into rows_n,amount from clara.metric_input_snapshot_contributions c join clara.account_set_version_members m on m.account_set_version_id=av.id and m.firm_id=rp.firm_id and m.client_id=p_client and m.account_id=c.account_id where c.snapshot_id=p_snapshot and c.firm_id=rp.firm_id and c.client_id=p_client and c.bound_period_id=target and c.posting_date between rp.period_start and rp.period_end;end if;if rows_n>0 and(((p_as_of is not null or n->>'aspect'='closing_balance')and exists(select 1 from clara.metric_input_snapshot_samples sx join clara.account_set_version_members mx on mx.account_set_version_id=av.id and mx.firm_id=rp.firm_id and mx.client_id=p_client and mx.account_id=sx.account_id where sx.snapshot_id=p_snapshot and sx.firm_id=rp.firm_id and sx.client_id=p_client and sx.period_id=target and sx.sample_date=sample_on and((present='positive_expense'and sx.account_type<>'expense')or(present='positive_revenue'and sx.account_type<>'income'))))or((p_as_of is null and n->>'aspect'<>'closing_balance')and exists(select 1 from clara.metric_input_snapshot_contributions cx join clara.account_set_version_members mx on mx.account_set_version_id=av.id and mx.firm_id=rp.firm_id and mx.client_id=p_client and mx.account_id=cx.account_id where cx.snapshot_id=p_snapshot and cx.firm_id=rp.firm_id and cx.client_id=p_client and cx.bound_period_id=target and cx.posting_date between rp.period_start and rp.period_end and((present='positive_expense'and cx.account_type<>'expense')or(present='positive_revenue'and cx.account_type<>'income')))))then select coalesce(array_agg(distinct c.entry_id order by c.entry_id),'{}'),coalesce(array_agg(distinct c.document_id order by c.document_id)filter(where c.document_id is not null),'{}')into r.entry_ids,r.document_ids from clara.metric_input_snapshot_contributions c join clara.account_set_version_members m on m.account_set_version_id=av.id and m.account_id=c.account_id where c.snapshot_id=p_snapshot and c.posting_date<=coalesce(p_as_of,rp.period_end)and(n->>'aspect'='closing_balance'or p_as_of is not null or(c.bound_period_id=target and c.posting_date>=rp.period_start));r.status:='refused';r.reason_key:='sign_presentation_mismatch';r.inputs:=r.inputs||jsonb_build_object('sign_normalizations',jsonb_build_array(present),'input_values',jsonb_build_object('node','measure','period_id',target,'aspect',n->>'aspect','present_as',present,'account_set_resolution',r.inputs->'account_set_resolution','value',null));return r;end if;if rows_n=0 and not av.zero_when_no_rows then r.status:='absent';r.reason_key:='absent';r.inputs:=r.inputs||jsonb_build_object('sign_normalizations',jsonb_build_array(present),'input_values',jsonb_build_object('node','measure','period_id',target,'aspect',n->>'aspect','present_as',present,'account_set_resolution',r.inputs->'account_set_resolution','value',null));return r;end if;r.numerator:=coalesce(amount,0);select coalesce(array_agg(distinct c.entry_id order by c.entry_id),'{}'),coalesce(array_agg(distinct c.document_id order by c.document_id)filter(where c.document_id is not null),'{}')into r.entry_ids,r.document_ids from clara.metric_input_snapshot_contributions c join clara.account_set_version_members m on m.account_set_version_id=av.id and m.account_id=c.account_id where c.snapshot_id=p_snapshot and c.posting_date<=coalesce(p_as_of,rp.period_end)and(n->>'aspect'='closing_balance'or p_as_of is not null or(c.bound_period_id=target and c.posting_date>=rp.period_start));r.currency_power:=1;r.days_power:=0;r.count_power:=0;r.temporality:=case when n->>'aspect'='closing_balance'then'point_in_time'else'flow'end;r.inputs:=coalesce(r.inputs,'{}')||jsonb_build_object('sign_normalizations',jsonb_build_array(present),'input_values',jsonb_build_object('node','measure','period_id',target,'aspect',n->>'aspect','present_as',present,'account_set_resolution',r.inputs->'account_set_resolution','value',jsonb_build_object('numerator',r.numerator,'denominator',r.denominator)));
 elsif k='constant'then select * into cv from clara.metric_constants where constant_key=n->>'key'and(firm_id is null or firm_id=(select firm_id from clara.metric_input_snapshots where id=p_snapshot))and effective_from<=rp.period_start and(effective_to is null or effective_to>=rp.period_start)order by firm_id nulls last,effective_from desc,version desc limit 1;if cv.id is null then r.status:='absent';r.reason_key:='absent';return r;end if;r.numerator:=cv.numerator;r.denominator:=cv.denominator;r.currency_power:=cv.currency_power;r.days_power:=cv.days_power;r.count_power:=cv.count_power;r.temporality:='flow';r.constant_version_ids:=array[cv.id];r.inputs:=jsonb_build_object('sign_normalizations','[]'::jsonb,'input_values',jsonb_build_object('node','constant','key',n->>'key','version_id',cv.id,'value',jsonb_build_object('numerator',r.numerator,'denominator',r.denominator)));
 elsif k='days_in_period'then r.numerator:=rp.period_end-rp.period_start+1;r.currency_power:=0;r.days_power:=1;r.count_power:=0;r.temporality:='flow';r.inputs:=jsonb_build_object('sign_normalizations','[]'::jsonb,'input_values',jsonb_build_object('node','days_in_period','period_id',target,'value',jsonb_build_object('numerator',r.numerator,'denominator',r.denominator)));
 elsif k='count'then source:=n->>'source';if source='open_items'then select count(*)::numeric,coalesce(array_agg(distinct o.entry_id order by o.entry_id),'{}')into r.numerator,r.entry_ids from clara.metric_input_snapshot_open_items o where o.snapshot_id=p_snapshot and o.item_date<=rp.period_end and(not(n?'domain')or o.domain=n->>'domain')and(not(n?'item_kind')or o.item_kind=n->>'item_kind')and o.amount_cents+coalesce((select sum(alloc.amount_cents)from clara.metric_input_snapshot_allocations alloc where alloc.snapshot_id=p_snapshot and alloc.item_id=o.item_id and alloc.domain=o.domain and alloc.effective_date<=rp.period_end),0)<>0;elsif source='allocations'then select count(*)::numeric into r.numerator from clara.metric_input_snapshot_allocations alloc where alloc.snapshot_id=p_snapshot and alloc.effective_date between rp.period_start and rp.period_end and(not(n?'domain')or alloc.domain=n->>'domain')and(not(n?'operation_kind')or alloc.operation_kind=n->>'operation_kind');elsif source='contributions'then select count(*)::numeric,coalesce(array_agg(distinct entry_id order by entry_id),'{}'),coalesce(array_agg(distinct document_id order by document_id)filter(where document_id is not null),'{}')into r.numerator,r.entry_ids,r.document_ids from clara.metric_input_snapshot_contributions where snapshot_id=p_snapshot and posting_date between rp.period_start and rp.period_end;else select count(*)::numeric into r.numerator from clara.metric_input_snapshot_samples where snapshot_id=p_snapshot and period_id=target;end if;r.currency_power:=0;r.days_power:=0;r.count_power:=1;r.temporality:='flow';r.inputs:=jsonb_build_object('sign_normalizations','[]'::jsonb,'input_values',jsonb_build_object('node','count','source',source,'period_id',target,'filters',n-array['node','source','scope'],'value',jsonb_build_object('numerator',r.numerator,'denominator',r.denominator)));
 elsif k='lag'then return clara._metric_eval_node_v2(p_firm,p_client,p_snapshot,p_context,target,n->'of',p_allow_negative,p_average_key,p_as_of);
 elsif k='average'and n?'of'then for sample_on in select distinct s.sample_date from clara.metric_input_snapshot_samples s where s.snapshot_id=p_snapshot and s.period_id=target and((p_average_key='avg_month_end_v1'and s.sample_date=(date_trunc('month',s.sample_date)+interval'1 month - 1 day')::date and s.sample_date between rp.period_start and rp.period_end)or(p_average_key='avg_open_close_v1'and s.sample_date in(rp.period_start-1,rp.period_end)))order by 1 loop a:=clara._metric_eval_node_v2(p_firm,p_client,p_snapshot,p_context,target,n->'of',p_allow_negative,p_average_key,sample_on);if a.status<>'ok'then return a;end if;signs:=signs||coalesce(a.inputs->'sign_normalizations','[]'::jsonb);operand_values:=operand_values||jsonb_build_array(jsonb_build_object('sample_date',sample_on,'value',jsonb_build_object('numerator',a.numerator,'denominator',a.denominator),'input',a.inputs->'input_values'));if sample_n=0 then r:=a;else r.numerator:=r.numerator*a.denominator+a.numerator*r.denominator;r.denominator:=r.denominator*a.denominator;r.account_set_version_ids:=array(select distinct unnest(r.account_set_version_ids||a.account_set_version_ids));r.entry_ids:=array(select distinct unnest(r.entry_ids||a.entry_ids));r.document_ids:=array(select distinct unnest(r.document_ids||a.document_ids));end if;r.inputs:=jsonb_build_object('sign_normalizations',signs,'input_values',jsonb_build_object('node','average','policy',p_average_key,'samples',operand_values));sample_n:=sample_n+1;end loop;if sample_n=0 then r.status:='absent';r.reason_key:='absent';return r;end if;r.denominator:=r.denominator*sample_n;r.temporality:='period_average';
 elsif k in('sum','average')then for x in select value from jsonb_array_elements(n->'terms')loop a:=clara._metric_eval_node_v2(p_firm,p_client,p_snapshot,p_context,target,x,p_allow_negative,p_average_key,p_as_of);if a.status<>'ok'then return a;end if;signs:=signs||coalesce(a.inputs->'sign_normalizations','[]'::jsonb);operand_values:=operand_values||jsonb_build_array(jsonb_build_object('operand',terms_n,'value',jsonb_build_object('numerator',a.numerator,'denominator',a.denominator),'input',a.inputs->'input_values'));if terms_n=0 then r:=a;else r.numerator:=r.numerator*a.denominator+a.numerator*r.denominator;r.denominator:=r.denominator*a.denominator;r.account_set_version_ids:=array(select distinct unnest(r.account_set_version_ids||a.account_set_version_ids));r.constant_version_ids:=array(select distinct unnest(r.constant_version_ids||a.constant_version_ids));r.entry_ids:=array(select distinct unnest(r.entry_ids||a.entry_ids));r.document_ids:=array(select distinct unnest(r.document_ids||a.document_ids));end if;r.inputs:=jsonb_build_object('sign_normalizations',signs,'input_values',jsonb_build_object('node',k,'operands',operand_values));terms_n:=terms_n+1;end loop;if k='average'then r.denominator:=r.denominator*terms_n;r.temporality:='period_average';end if;
 elsif k='cell'then select mc.* into v_cell from clara.metric_cells mc where mc.id=(n->>'cell_id')::uuid and mc.firm_id=p_firm and mc.client_id=p_client;if not found then raise exception 'metric cell reference does not resolve in this firm and client'using errcode='CLR11',detail='{"reason":"metric_cell_reference_unknown","fix":"cite a metric cell minted for this firm and this client"}';end if;if v_cell.definition_version_id is null then raise exception 'a cell operand must be definition-backed'using errcode='CLR10',detail='{"reason":"metric_cell_reference_not_definition_backed","fix":"cite a canonical, definition-backed cell -- a preview-composed cell is another composition''s own output, not a raw-books fact"}';end if;if v_cell.cell_status is distinct from'ok'then raise exception 'a cell operand must have evaluated ok'using errcode='CLR10',detail=jsonb_build_object('reason','metric_cell_reference_not_ok','cell_status',v_cell.cell_status)::text;end if;select s.books_watermark into v_snap_watermark from clara.metric_input_snapshots s where s.id=p_snapshot;if v_snap_watermark is null or v_snap_watermark is distinct from v_cell.books_watermark then raise exception 'a cell operand was computed against a different books watermark'using errcode='CLR10',detail=jsonb_build_object('reason','metric_cell_context_mismatch','class','books_watermark','fix','cite a cell minted against the same books watermark this composition reads')::text;end if;select coalesce(array_agg(distinct cp2.period_id),'{}')into v_cell_periods from clara.metric_cell_periods cp2 where cp2.cell_id=v_cell.id and cp2.firm_id=p_firm and cp2.client_id=p_client;select coalesce(array_agg(distinct ep.period_id),'{}')into v_ctx_periods from clara.metric_evaluation_context_periods ep where ep.context_id=p_context and ep.firm_id=p_firm and ep.client_id=p_client;if v_cell_periods is distinct from v_ctx_periods then raise exception 'a cell operand was computed over a different period set'using errcode='CLR10',detail=jsonb_build_object('reason','metric_cell_context_mismatch','class','period_set','fix','cite a cell whose own reporting periods are exactly this composition''s bound period set')::text;end if;select ep.period_id into v_root_period from clara.metric_evaluation_context_periods ep where ep.context_id=p_context and ep.firm_id=p_firm and ep.client_id=p_client and ep.ordinal=0;if v_root_period is null or target is distinct from v_root_period then raise exception 'a cell operand may not be read at a shifted period'using errcode='CLR10',detail=jsonb_build_object('reason','metric_cell_context_mismatch','class','period_shift','fix','a cell node carries its own whole-period-set value and IS the composition root''s reporting moment; lag a raw measure instead of a cell')::text;end if;select mu.currency_power,mu.days_power,mu.count_power,dv.temporality_key into v_cp,v_dp,v_np,v_temp from clara.metric_units mu,clara.metric_definition_versions dv where mu.unit_key=v_cell.unit_key and dv.id=v_cell.definition_version_id;if v_temp is null then raise exception 'a cell operand''s unit or temporality is not registered'using errcode='CLR10',detail='{"reason":"declaration_mismatch"}';end if;r.currency_power:=v_cp;r.days_power:=v_dp;r.count_power:=v_np;r.temporality:=v_temp;r.numerator:=v_cell.exact_numerator;r.denominator:=v_cell.exact_denominator;r.account_set_version_ids:='{}';r.constant_version_ids:='{}';r.entry_ids:='{}';r.document_ids:='{}';r.inputs:=jsonb_build_object('sign_normalizations','[]'::jsonb,'input_values',jsonb_build_object('node','cell','cell_id',v_cell.id,'value',jsonb_build_object('numerator',v_cell.exact_numerator,'denominator',v_cell.exact_denominator)));
 else if k='percent_change'then b:=clara._metric_eval_node_v2(p_firm,p_client,p_snapshot,p_context,target,n->'prior',p_allow_negative,p_average_key,p_as_of);if b.status<>'ok'then return b;end if;a:=clara._metric_eval_node_v2(p_firm,p_client,p_snapshot,p_context,target,n->'current',p_allow_negative,p_average_key,p_as_of);else a:=clara._metric_eval_node_v2(p_firm,p_client,p_snapshot,p_context,target,case when k='divide'then n->'num'else n->'left'end,p_allow_negative,p_average_key,p_as_of);b:=clara._metric_eval_node_v2(p_firm,p_client,p_snapshot,p_context,target,case when k='divide'then n->'den'else n->'right'end,p_allow_negative,p_average_key,p_as_of);end if;if a.status<>'ok'then return a;elsif b.status<>'ok'then return b;end if;r.account_set_version_ids:=array(select distinct unnest(a.account_set_version_ids||b.account_set_version_ids));r.constant_version_ids:=array(select distinct unnest(a.constant_version_ids||b.constant_version_ids));r.entry_ids:=array(select distinct unnest(a.entry_ids||b.entry_ids));r.document_ids:=array(select distinct unnest(a.document_ids||b.document_ids));r.inputs:=jsonb_build_object('sign_normalizations',coalesce(a.inputs->'sign_normalizations','[]'::jsonb)||coalesce(b.inputs->'sign_normalizations','[]'::jsonb),'input_values',jsonb_build_object('node',k,'operands',jsonb_build_array(jsonb_build_object('operand',case when k='divide'then'num'when k='percent_change'then'current'else'left'end,'value',jsonb_build_object('numerator',a.numerator,'denominator',a.denominator),'input',a.inputs->'input_values'),jsonb_build_object('operand',case when k='divide'then'den'when k='percent_change'then'prior'else'right'end,'value',jsonb_build_object('numerator',b.numerator,'denominator',b.denominator),'input',b.inputs->'input_values'))));if k='subtract'then r.numerator:=a.numerator*b.denominator-b.numerator*a.denominator;r.denominator:=a.denominator*b.denominator;r.currency_power:=a.currency_power;r.days_power:=a.days_power;r.count_power:=a.count_power;r.temporality:=a.temporality;elsif k='multiply'then r.numerator:=a.numerator*b.numerator;r.denominator:=a.denominator*b.denominator;r.currency_power:=a.currency_power+b.currency_power;r.days_power:=a.days_power+b.days_power;r.count_power:=a.count_power+b.count_power;r.temporality:='flow';else if b.numerator=0 then r.status:='undefined';r.reason_key:='divide_by_zero';r.numerator:=null;r.denominator:=null;return r;elsif b.numerator<0 and not p_allow_negative then r.status:='undefined';r.reason_key:='negative_denominator';r.numerator:=null;r.denominator:=null;return r;elsif b.numerator<0 then r.inputs:=r.inputs||'{"negative_base":true}';end if;if k='percent_change'then r.numerator:=(a.numerator*b.denominator-b.numerator*a.denominator)*b.denominator;r.denominator:=a.denominator*b.denominator*b.numerator;else r.numerator:=a.numerator*b.denominator;r.denominator:=a.denominator*b.numerator;end if;r.currency_power:=a.currency_power-b.currency_power;r.days_power:=a.days_power-b.days_power;r.count_power:=a.count_power-b.count_power;r.temporality:='flow';end if;end if;if r.status='ok'then if r.denominator<0 then r.numerator:=-r.numerator;r.denominator:=-r.denominator;end if;g:=abs(r.numerator);h:=r.denominator;while h<>0 loop t:=mod(g,h);g:=h;h:=t;end loop;if g<>0 then r.numerator:=trim_scale(r.numerator/g);r.denominator:=trim_scale(r.denominator/g);else r.numerator:=0::numeric;r.denominator:=trim_scale(r.denominator);end if;end if;return r;end$$;
revoke all on function clara._metric_eval_node_v2(uuid,uuid,uuid,uuid,uuid,jsonb,boolean,text,date) from public;

-- =====================================================================================
-- SECTION 5 -- BL-2: the REAL, HONEST v2 ENTRYPOINT.
--
-- clara.evaluate_metric_v2 is minted as a genuine, callable, correctly-typed evaluate_*-named
-- function rather than left implicit. Two reasons, both mechanical:
--   * clara.verify_evaluator_freeze() requires `entry_count = 1` -- exactly one closure member
--     whose signature equals the row's entrypoint_signature. Without a real function there is no
--     literal target to count.
--   * scripts/check-frozen-evaluators.mjs discovers evaluators by the clara.evaluate_* name shape.
--     A v2 vocabulary reachable only through underscore-named cores would be catalog-frozen at
--     apply and INVISIBLE to review -- the half-freeze that manifest exists to close. Its class-4
--     rule ("a migration NEW vs base that defines an evaluate_* function must mint its own
--     clara.evaluator_versions row in the SAME file") is satisfied by construction: SECTION 6 is in
--     this file.
--
-- CD-14, APPROVED 2026-08-26 -- ITS CALLER SET IS DELIBERATELY EMPTY TODAY.
-- propose_metric_definition / approve_metric_definition stay v1-scoped, and so does
-- _validate_metric_ast_shape_v1, the proposal-time structural gate
-- _eta_save_metric_definition_draft_core calls (N3's SECOND independent door). A `cell`-containing
-- AST is therefore refused at DRAFT-SAVE time, before a canonical proposal could even exist -- so
-- no human-proposable, firm-approved, `cell`-referencing CANONICAL definition is buildable through
-- this file, at either door. Stage (b) works entirely through the PREVIEW pathway (SECTION 7).
-- evaluate_metric_v2 is the evaluator-identity anchor the freeze machinery requires, and it is a
-- correct evaluator for any cell-free definition it is ever handed.
--
-- A NOTE THE REVIEWER SHOULD NOT HAVE TO DERIVE: a cell minted through evaluate_metric_v2 carries
-- definition_version_id NOT NULL, so _tf_metric_cell_integrity re-derives it through its
-- DEFINITION-BACKED branch, which calls _metric_eval_node_v1. That is correct and not an oversight:
-- the two doors above make a canonical definition's AST provably cell-free, and on a cell-free AST
-- v1 and v2 are the same function (B5.8's differential is the proof). The entrypoint-literal
-- branching in SECTION 8 governs the DEFINITIONLESS branch, which is the only one a `cell` node can
-- reach.
-- =====================================================================================
create function clara.evaluate_metric_v2(p_client uuid,p_definition_version_id uuid,p_period_ids uuid[],p_snapshot_id uuid,p_run_id uuid)returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$declare c record;dv record;s record;ctx record;ev uuid;root_period uuid;root_start date;v clara.metric_value_v1;z jsonb;reason_id uuid;cell uuid;factor numeric;q numeric;rem numeric;shown text;na jsonb;bound_period_ids uuid[];begin c:=clara._human_ctx(clara.role_rank('bookkeeper'));if p_period_ids is null or cardinality(p_period_ids)not between 1 and 25 or cardinality(array(select distinct x from unnest(p_period_ids)x))<>cardinality(p_period_ids)then raise exception 'context period binding invalid'using errcode='CLR10',detail='{"reason":"cost_exceeded","class":"context_periods","limit":25}';end if;select * into s from clara.metric_input_snapshots where id=p_snapshot_id and client_id=p_client and firm_id=c.firm;if s.id is null or cardinality(p_period_ids)<>(select count(*)from clara.metric_input_snapshot_periods where snapshot_id=s.id and period_id=any(p_period_ids))then raise exception 'metric snapshot/context binding incomplete'using errcode='CLR11';end if;select * into dv from clara.metric_definition_versions where id=p_definition_version_id and(firm_id is null or firm_id=c.firm)and state in('canonical','firm_approved');if dv.id is null then raise exception 'definition is not approved for this firm'using errcode='CLR11';end if;root_period:=p_period_ids[1];if not exists(select 1 from clara.metric_input_snapshot_periods p where p.snapshot_id=s.id and p.period_id=root_period and dv.applies_from<=p.period_start and(dv.applies_to is null or dv.applies_to>=p.period_start))then raise exception 'definition is not effective for target period'using errcode='CLR10',detail='{"reason":"scope_mismatch"}';end if;select period_start into strict root_start from clara.metric_input_snapshot_periods where snapshot_id=s.id and period_id=root_period;perform clara.validate_metric_ast_v2(dv.ast,c.firm,p_client);select id into ev from clara.evaluator_versions where evaluator_name='evaluate_metric'and version=2 and firm_id is null and deployed;if ev is null then raise exception 'metric evaluator is not deployed'using errcode='CLR10',detail='{"reason":"evaluator_undeployed"}';end if;perform pg_advisory_xact_lock(hashtextextended(c.firm::text||':'||p_run_id::text,0));z:=clara._reserve_op(c.firm,'evaluate_metric_v2',p_run_id::text||':'||dv.id::text,clara._hash(jsonb_build_object('client',p_client,'definition',dv.id,'periods',p_period_ids,'snapshot',s.id)));if z is not null then return z;end if;if(select count(*)from clara.metric_cells where firm_id=c.firm and run_id=p_run_id)>=5000 then raise exception 'metric run cost exceeded'using errcode='CLR10',detail='{"reason":"cost_exceeded","class":"cells_per_run","limit":5000}';end if;select * into ctx from clara.metric_evaluation_contexts where client_id=p_client and run_id=p_run_id for update;if ctx.id is null then if exists(select 1 from clara.metric_evaluation_contexts where firm_id=c.firm and run_id=p_run_id)then raise exception 'run context is ambiguous within the firm'using errcode='CLR10',detail='{"reason":"scope_mismatch","class":"run_context"}';end if;insert into clara.metric_evaluation_contexts(firm_id,client_id,snapshot_id,evaluator_version_id,run_id,context_sha256,created_by)values(c.firm,p_client,s.id,ev,p_run_id,clara._metric_context_sha256_v1(s.id,p_period_ids,c.firm,p_client,s.producer_version_id,ev,s.dataset_sha256,s.books_watermark),c.actor)returning * into ctx;insert into clara.metric_evaluation_context_periods select ctx.id,s.id,c.firm,p_client,p.period_id,p.period_start,p.period_end,u.ord-1 from unnest(p_period_ids)with ordinality u(pid,ord)join clara.metric_input_snapshot_periods p on p.snapshot_id=s.id and p.period_id=u.pid;else select array_agg(period_id order by ordinal)into bound_period_ids from clara.metric_evaluation_context_periods where context_id=ctx.id;if ctx.snapshot_id<>s.id or ctx.evaluator_version_id<>ev or bound_period_ids is distinct from p_period_ids then raise exception 'run context is immutable and mismatched'using errcode='CLR10',detail='{"reason":"scope_mismatch"}';end if;end if;v:=clara._metric_eval_node_v2(c.firm,p_client,s.id,ctx.id,root_period,dv.ast->'root',dv.allow_negative,(select policy_key from clara.averaging_policy_versions where id=dv.averaging_policy_id),null);if v.status<>'ok'then select id into reason_id from clara.metric_na_reason_versions where reason_key=v.reason_key and firm_id is null and effective_from<=root_start and(effective_to is null or effective_to>=root_start)order by version desc limit 1;if reason_id is null then raise exception 'no N/A reason version is effective for the root reporting period'using errcode='CLR10',detail=jsonb_build_object('reason','scope_mismatch','class','na_reason_effectivity','reason_key',v.reason_key,'root_period_start',root_start,'fix','publish one metric_na_reason_versions row whose effective window covers the root reporting period start')::text;end if;else factor:=power(10::numeric,dv.result_scale);q:=div(abs(v.numerator)*factor,v.denominator);rem:=mod(abs(v.numerator)*factor,v.denominator);if rem*2>=v.denominator then q:=q+1;end if;shown:=to_char((case when v.numerator<0 then-q else q end)/factor,'FM999999999999999999999999999999999999999999999999990'||case when dv.result_scale>0 then'.'||repeat('0',dv.result_scale)else''end);end if;na:=jsonb_build_object('presentation_map_versions',jsonb_build_object('version',1,'reason','definition_has_no_presentation_map_binding'),'model_proposal',jsonb_build_object('version',1,'reason','evaluator_originated'),'human_approval',jsonb_build_object('version',1,'reason','no_numeric_approval'),'supersession',jsonb_build_object('version',1,'reason','first_mint'));if cardinality(v.document_ids)=0 then na:=na||jsonb_build_object('documents',jsonb_build_object('version',1,'reason','no_document-backed_input_rows'));end if;insert into clara.metric_cells(firm_id,client_id,run_id,evaluation_context_id,definition_version_id,formula_sha256,resolved_inputs_sha256,evaluator_version_id,books_watermark,cell_status,na_reason_version_id,exact_numerator,exact_denominator,unit_key,displayed_scale,displayed_text,inputs)values(c.firm,p_client,p_run_id,ctx.id,dv.id,dv.formula_sha256,clara._metric_resolved_inputs_sha256_v1(ctx.context_sha256,p_period_ids,c.firm,p_client,dv.id,dv.formula_sha256,v.account_set_version_ids,v.constant_version_ids,dv.edge_policy_set_id,dv.averaging_policy_id,ev,s.books_watermark),ev,s.books_watermark,v.status,reason_id,case when v.status='ok'then v.numerator end,case when v.status='ok'then v.denominator end,dv.unit_key,case when v.status='ok'then dv.result_scale end,shown,coalesce(v.inputs,'{}')||jsonb_build_object('normalized_provenance',jsonb_build_object('period_ids',p_period_ids,'snapshot_ids',array[s.id],'account_set_version_ids',array(select x from unnest(v.account_set_version_ids)x order by x),'constant_version_ids',array(select x from unnest(v.constant_version_ids)x order by x),'entry_ids',array(select x from unnest(v.entry_ids)x order by x),'document_ids',array(select x from unnest(v.document_ids)x order by x),'presentation_map_version_ids','{}'::uuid[]),'schema','clara.metric-cell-inputs/v1','provenance_not_applicable',na))returning id into cell;insert into clara.metric_cell_periods select cell,c.firm,p_client,p.period_id,p.period_start,p.period_end,u.ord-1 from unnest(p_period_ids)with ordinality u(pid,ord)join clara.metric_input_snapshot_periods p on p.snapshot_id=s.id and p.period_id=u.pid;insert into clara.metric_cell_snapshots values(cell,c.firm,p_client,s.id);insert into clara.metric_cell_account_sets select cell,c.firm,p_client,x from unnest(v.account_set_version_ids)x;insert into clara.metric_cell_constants select cell,c.firm,p_client,x from unnest(v.constant_version_ids)x;insert into clara.metric_cell_entries select cell,c.firm,p_client,x from unnest(v.entry_ids)x;insert into clara.metric_cell_documents select cell,c.firm,p_client,x from unnest(v.document_ids)x;perform clara._audit(c.firm,c.actor,null,null,'evaluate_metric_v2',null,jsonb_build_object('client',p_client,'cell_id',cell,'run_id',p_run_id));return clara._finish_op(c.firm,'evaluate_metric_v2',p_run_id::text||':'||dv.id::text,jsonb_build_object('cell_id',cell,'cell_status',v.status,'reason_key',v.reason_key));end$$;
revoke all on function clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid) from public;
grant execute on function clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid) to clara_authenticated;

-- =====================================================================================
-- SECTION 6 -- THE ('evaluate_metric', 2) CLOSURE. Registered from POSITIVE live-catalog reads,
-- reproducing 0059:245-246's idiom exactly -- including the catalog-only search_path, which is what
-- makes pg_get_functiondef's qualification stable between registration here and verification by
-- clara.verify_evaluator_freeze() (whose own body pins the same search_path).
--
-- NINE MEMBERS, and the membership is a JUDGEMENT this file states rather than inherits. v1's
-- closure is TEN and its tenth is clara.evaluate_fs_pack_v1 -- the pack driver that calls
-- evaluate_metric_v1. That function is pinned to v1's entrypoint and is no part of v2's
-- determinism, so freezing it into v2's closure would assert a closure v2 does not have. The nine
-- are: the four v2 bodies, and the FIVE v1 helpers reused VERBATIM
-- (_metric_selector_account_ids, _metric_input_dataset_v1, _metric_context_sha256_v1,
-- _metric_resolved_inputs_sha256_v1, _hash). A helper being a member of BOTH closures is exactly
-- what evaluator_version_members' own PK (evaluator_version_id, member_signature) accommodates.
--
-- clara._normalize_metric_node_v1 is NOT a member -- it is not a member of v1's closure either,
-- and this file mints no _v2 sibling for it. BL-4 item 4, verified by reading its full body
-- (0059:70): it recurses on sum/average terms, lag/average `of`, divide num/den, percent_change
-- current/prior and subtract/multiply left/right, and its `else return n` catch-all returns any
-- OTHER node UNCHANGED. For a `cell` node -- a leaf with no sub-nodes and no commutative structure
-- -- returning it byte-identically IS the correct normalization. Battery cell B5.7 proves that
-- behaviourally, both for the bare leaf and for a cell leaf nested inside a normalizing parent,
-- because the composition-identity hash and the integrity trigger's re-derivation both depend on
-- it silently.
--
-- BORN UNDEPLOYED. See this file's header: the flip is a separate ceremony act, and the trigger
-- would refuse it here anyway.
-- =====================================================================================
set local search_path = pg_catalog, pg_temp;
do $freeze$
declare e uuid; h bytea;
begin
  select sha256(convert_to(string_agg(encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')),'hex'),'' order by o),'UTF8')) into h
    from (values
      (0,'clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)'),
      (1,'clara._metric_eval_node_v2(uuid,uuid,uuid,uuid,uuid,jsonb,boolean,text,date)'),
      (2,'clara.validate_metric_ast_v2(jsonb,uuid,uuid)'),
      (3,'clara._validate_metric_node_v2(jsonb,uuid,uuid,integer)'),
      (4,'clara._metric_selector_account_ids(uuid,jsonb)'),
      (5,'clara._metric_input_dataset_v1(uuid,uuid,uuid[])'),
      (6,'clara._metric_context_sha256_v1(uuid,uuid[],uuid,uuid,uuid,uuid,bytea,text)'),
      (7,'clara._metric_resolved_inputs_sha256_v1(bytea,uuid[],uuid,uuid,uuid,bytea,uuid[],uuid[],uuid,uuid,uuid,text)'),
      (8,'clara._hash(jsonb)')
    ) m(o,s);
  insert into clara.evaluator_versions(evaluator_name,version,entrypoint_signature,closure_sha256,migration_version,deployed)
    values ('evaluate_metric',2,'clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)',h,'card1_substitution_seam',false)
    returning id into e;
  insert into clara.evaluator_version_members(evaluator_version_id,ordinal,member_signature,body_sha256,firm_id)
    select e,o,s,sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')),null::uuid
      from (values
        (0,'clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)'),
        (1,'clara._metric_eval_node_v2(uuid,uuid,uuid,uuid,uuid,jsonb,boolean,text,date)'),
        (2,'clara.validate_metric_ast_v2(jsonb,uuid,uuid)'),
        (3,'clara._validate_metric_node_v2(jsonb,uuid,uuid,integer)'),
        (4,'clara._metric_selector_account_ids(uuid,jsonb)'),
        (5,'clara._metric_input_dataset_v1(uuid,uuid,uuid[])'),
        (6,'clara._metric_context_sha256_v1(uuid,uuid[],uuid,uuid,uuid,uuid,bytea,text)'),
        (7,'clara._metric_resolved_inputs_sha256_v1(bytea,uuid[],uuid,uuid,uuid,bytea,uuid[],uuid[],uuid,uuid,uuid,text)'),
        (8,'clara._hash(jsonb)')
      ) m(o,s);
end
$freeze$;
set local search_path = clara, pg_catalog, pg_temp;

-- =====================================================================================
-- SECTION 7 -- STAGE (b)'s REACHABLE PATH: the v2 preview core and its wake wrapper
-- (design SS3.2 item 5, D2, M2/CD-16).
--
-- A NEW PAIR, NEVER A REWRITE OF THE v1 PAIR. The v2 core is _eta_compose_metric_preview_core's
-- body with exactly three behavioural changes -- it resolves ('evaluate_metric', 2), it validates
-- through validate_metric_ast_v2, and it evaluates through _metric_eval_node_v2 -- plus its own op
-- namespace (see below). The receipt shape (_reserve_op / _audit / _finish_op), the cost ceilings,
-- the policy-effectivity REFUSAL-not-RESELECTION discipline (0077:177-190's load-bearing comment)
-- and the metric_cells insert shape are copied VERBATIM, not reinvented, because D2's ruling keeps
-- S17's walls SHUT: no model_proposal / human_approval relation, no loosened CHECK. The preview
-- path's existing "not_applicable" provenance stamp IS stage (b)'s provenance.
--
-- ITS OWN OP NAMESPACE, and this is a real correction rather than a cosmetic rename.
-- clara.op_receipts is keyed (firm_id, fn, op_key). Had the v2 core reserved under v1's `fn`, a v1
-- and a v2 call sharing a caller-chosen op_key would collide, and _reserve_op would hand the
-- SECOND caller the FIRST call's stored result -- a v2 composition silently answered with a v1
-- cell. The name here, the wake_fn_allowlist row below, and the wrapper's assert_wake_allowed
-- argument are all 'wake_compose_metric_preview_v2', consistently.
--
-- M2/CD-16 -- THE ALLOWLIST ROW IS ('interactive', ...) ALONE, PERMANENTLY. Never
-- 'interactive_client': 0132's own live text measures that kind as capped at EXACTLY ONE verb
-- (wake_open_question) and tail-censuses the cap (0132:1379-1382). This file's own tail re-proves
-- that the cap still holds -- i.e. that this file did not touch it.
-- =====================================================================================
create function clara._eta_compose_metric_preview_core_v2(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_ast jsonb, p_period_ids uuid[], p_snapshot_id uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $core$
declare s record; ctx record; ev uuid; root_period uuid; root_start date; norm jsonb; comp jsonb;
  v clara.metric_value_v1; cell uuid; edge_id uuid; avg_id uuid; avg_key text; scale smallint;
  factor numeric; q numeric; rem numeric; shown text; na jsonb; reason_id uuid; run_id uuid; z jsonb;
begin
  if p_snapshot_id is null then
    raise exception 'a metric preview must name the immutable snapshot it reads'
      using errcode = 'CLR10', detail = '{"reason":"invalid_request","class":"snapshot_id","constraint":"nonnull","fix":"mint a metric input snapshot on the human lane and pass its id"}';
  end if;
  if p_period_ids is null or cardinality(p_period_ids) not between 1 and 25
     or array_position(p_period_ids, null) is not null
     or cardinality(array(select distinct x from unnest(p_period_ids) x)) <> cardinality(p_period_ids) then
    raise exception 'metric preview period binding invalid' using errcode = 'CLR10',
      detail = '{"reason":"cost_exceeded","class":"context_periods","limit":25}';
  end if;
  select * into s from clara.metric_input_snapshots
   where id = p_snapshot_id and client_id = p_client and firm_id = p_firm;
  if s.id is null or cardinality(p_period_ids) <> (select count(*) from clara.metric_input_snapshot_periods
      where snapshot_id = s.id and period_id = any(p_period_ids)) then
    raise exception 'metric preview snapshot/context binding incomplete' using errcode = 'CLR11';
  end if;
  -- The ROOT period anchors every period-effective resolution below, the same anchor delta's
  -- evaluator and its wall both use. Resolved HERE, before anything is reserved or written, so a
  -- policy-effectivity refusal costs no durable state.
  root_period := p_period_ids[1];
  select period_start into strict root_start from clara.metric_input_snapshot_periods
   where snapshot_id = s.id and period_id = root_period;
  -- Delta's validator is the ONE authority on the AST contract; eta never re-implements it.
  perform clara.validate_metric_ast_v2(p_ast, p_firm, p_client);
  select id into ev from clara.evaluator_versions
   where evaluator_name = 'evaluate_metric' and version = 2 and firm_id is null and deployed;
  if ev is null then
    raise exception 'metric evaluator is not deployed' using errcode = 'CLR10',
      detail = '{"reason":"evaluator_undeployed"}';
  end if;
  select id into edge_id from clara.edge_policy_sets
   where policy_set_key = p_ast #>> '{edge_policy_set}' and (firm_id is null or firm_id = p_firm)
   order by firm_id nulls last, version desc limit 1;
  avg_key := 'avg_month_end_v1';
  select id into avg_id from clara.averaging_policy_versions
   where policy_key = avg_key and (firm_id is null or firm_id = p_firm) and implemented
   order by firm_id nulls last, version desc limit 1;
  if edge_id is null or avg_id is null then
    raise exception 'metric preview policy binding is absent' using errcode = 'CLR11',
      detail = '{"reason":"scope_mismatch","class":"composition_policies"}';
  end if;
  -- POLICY EFFECTIVITY, ENFORCED BY REFUSAL RATHER THAN BY RE-SELECTION -- and the distinction is
  -- load-bearing, not stylistic. The two SELECTs above are byte-for-byte the rule
  -- clara._tf_metric_cell_integrity's definitionless branch uses (highest version, firm override
  -- first, NO effective-window filter), and that wall re-derives resolved_inputs_sha256 from the
  -- ids ITS rule picks and refuses 'composition resolved inputs hash does not reconstruct' on any
  -- disagreement. So a core that filtered by window here would select a different id than the wall
  -- on exactly the estates where the rules diverge, and EVERY preview there would fail CLR11 --
  -- measured on a stage: with two eps_v1 versions the two rules return different ids, the deployed
  -- wall carries no window filter, and the hash is sensitive to the id.
  --
  -- What this lane CAN do, and does, is refuse to mint a preview whose policies are not effective
  -- for the root period. The number is never silently computed under a policy version that does not
  -- govern the period being presented; the disagreement is surfaced instead of absorbed. Closing it
  -- by SELECTION is delta's to do, in the wall and the writer together, under a D1 window.
  if not exists(select 1 from clara.edge_policy_sets e where e.id = edge_id
      and e.effective_from <= root_start and (e.effective_to is null or e.effective_to >= root_start)) then
    raise exception 'the bound edge policy is not effective for the preview root period'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'scope_mismatch',
        'class', 'edge_policy_effectivity', 'root_period_start', root_start,
        'fix', 'register an edge-policy version whose effective window covers the root reporting period, or preview a period the current version governs')::text;
  end if;
  if not exists(select 1 from clara.averaging_policy_versions a where a.id = avg_id
      and a.effective_from <= root_start and (a.effective_to is null or a.effective_to >= root_start)) then
    raise exception 'the bound averaging policy is not effective for the preview root period'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'scope_mismatch',
        'class', 'averaging_policy_effectivity', 'root_period_start', root_start,
        'fix', 'register an implemented averaging-policy version whose effective window covers the root reporting period')::text;
  end if;
  norm := (p_ast - 'root') || jsonb_build_object('root', clara._normalize_metric_node_v1(p_ast -> 'root'));
  -- The composition object is the cell's formula identity. Its shape is delta's, read from
  -- clara._tf_metric_cell_integrity's definitionless branch, which re-derives every clause below.
  comp := jsonb_build_object(
    'evaluator_entrypoint', (select entrypoint_signature from clara.evaluator_versions where id = ev),
    'ast', norm, 'allow_negative', false, 'averaging_policy', avg_key);
  z := clara._reserve_op(p_firm, 'wake_compose_metric_preview_v2', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'composition', comp, 'periods', p_period_ids,
      'snapshot', p_snapshot_id)));
  if z is not null then return z; end if;
  run_id := gen_random_uuid();
  insert into clara.metric_evaluation_contexts(firm_id, client_id, snapshot_id, evaluator_version_id,
      run_id, context_sha256, created_by)
    values (p_firm, p_client, s.id, ev, run_id,
      clara._metric_context_sha256_v1(s.id, p_period_ids, p_firm, p_client, s.producer_version_id, ev,
        s.dataset_sha256, s.books_watermark), p_actor)
    returning * into ctx;
  insert into clara.metric_evaluation_context_periods
    select ctx.id, s.id, p_firm, p_client, p.period_id, p.period_start, p.period_end, u.ord - 1
      from unnest(p_period_ids) with ordinality u(pid, ord)
      join clara.metric_input_snapshot_periods p on p.snapshot_id = s.id and p.period_id = u.pid;
  v := clara._metric_eval_node_v2(p_firm, p_client, s.id, ctx.id, root_period, norm -> 'root', false, avg_key, null);
  scale := (p_ast ->> 'result_scale')::smallint;
  if v.status <> 'ok' then
    -- Same period-effective resolution delta's writer and wall both use; disagreeing would be
    -- refused by clara._tf_metric_cell_integrity rather than silently persisted.
    select id into reason_id from clara.metric_na_reason_versions
     where reason_key = v.reason_key and firm_id is null and effective_from <= root_start
       and (effective_to is null or effective_to >= root_start) order by version desc limit 1;
    if reason_id is null then
      raise exception 'no N/A reason version is effective for the preview root period'
        using errcode = 'CLR10', detail = '{"reason":"scope_mismatch","class":"na_reason_effectivity"}';
    end if;
  else
    factor := power(10::numeric, scale);
    -- EXACT integer division, matching the wall term for term (delta F7, folded in). numeric division is inexact at ~16 significant digits while mod() is exact, so the old trunc(a*factor/den) drifted one ulp at large magnitudes -- and clara._tf_metric_cell_integrity re-derives this value and REFUSES on mismatch, so a divergence here is not a rounding nicety: it is a preview that cannot be written at all.
    q := div(abs(v.numerator) * factor, v.denominator);
    rem := mod(abs(v.numerator) * factor, v.denominator);
    if rem * 2 >= v.denominator then q := q + 1; end if;
    shown := to_char((case when v.numerator < 0 then -q else q end) / factor,
      'FM999999999999999999999999999999999999999999999999990' ||
      case when scale > 0 then '.' || repeat('0', scale) else '' end);
  end if;
  na := jsonb_build_object(
    'presentation_map_versions', jsonb_build_object('version', 1, 'reason', 'definition_has_no_presentation_map_binding'),
    'model_proposal', jsonb_build_object('version', 1, 'reason', 'evaluator_originated'),
    'human_approval', jsonb_build_object('version', 1, 'reason', 'no_numeric_approval'),
    'supersession', jsonb_build_object('version', 1, 'reason', 'first_mint'));
  if cardinality(v.document_ids) = 0 then
    na := na || jsonb_build_object('documents', jsonb_build_object('version', 1, 'reason', 'no_document-backed_input_rows'));
  end if;
  insert into clara.metric_cells(firm_id, client_id, run_id, evaluation_context_id, definition_version_id,
      formula_sha256, resolved_inputs_sha256, evaluator_version_id, books_watermark, cell_status,
      na_reason_version_id, exact_numerator, exact_denominator, unit_key, displayed_scale, displayed_text, inputs)
    values (p_firm, p_client, run_id, ctx.id, null, clara._hash(comp),
      clara._metric_resolved_inputs_sha256_v1(ctx.context_sha256, p_period_ids, p_firm, p_client, null,
        clara._hash(comp), v.account_set_version_ids, v.constant_version_ids, edge_id, avg_id, ev, s.books_watermark),
      ev, s.books_watermark, v.status, reason_id,
      case when v.status = 'ok' then v.numerator end, case when v.status = 'ok' then v.denominator end,
      case p_ast ->> 'unit' when 'currency' then 'money' else p_ast ->> 'unit' end,
      case when v.status = 'ok' then scale end, shown,
      coalesce(v.inputs, '{}') || jsonb_build_object(
        'normalized_provenance', jsonb_build_object('period_ids', p_period_ids, 'snapshot_ids', array[s.id],
          'account_set_version_ids', array(select x from unnest(v.account_set_version_ids) x order by x),
          'constant_version_ids', array(select x from unnest(v.constant_version_ids) x order by x),
          'entry_ids', array(select x from unnest(v.entry_ids) x order by x),
          'document_ids', array(select x from unnest(v.document_ids) x order by x),
          'presentation_map_version_ids', '{}'::uuid[]),
        'schema', 'clara.metric-composition-inputs/v1', 'provenance_not_applicable', na,
        'composition', comp))
    returning id into cell;
  insert into clara.metric_cell_periods
    select cell, p_firm, p_client, p.period_id, p.period_start, p.period_end, u.ord - 1
      from unnest(p_period_ids) with ordinality u(pid, ord)
      join clara.metric_input_snapshot_periods p on p.snapshot_id = s.id and p.period_id = u.pid;
  insert into clara.metric_cell_snapshots values (cell, p_firm, p_client, s.id);
  insert into clara.metric_cell_account_sets select cell, p_firm, p_client, x from unnest(v.account_set_version_ids) x;
  insert into clara.metric_cell_constants select cell, p_firm, p_client, x from unnest(v.constant_version_ids) x;
  insert into clara.metric_cell_entries select cell, p_firm, p_client, x from unnest(v.entry_ids) x;
  insert into clara.metric_cell_documents select cell, p_firm, p_client, x from unnest(v.document_ids) x;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'wake_compose_metric_preview_v2', null,
    jsonb_build_object('client', p_client, 'cell_id', cell, 'run_id', run_id, 'preview', true));
  return clara._finish_op(p_firm, 'wake_compose_metric_preview_v2', p_op_key,
    jsonb_build_object('cell_id', cell, 'run_id', run_id, 'cell_status', v.status,
      'reason_key', v.reason_key, 'displayed_text', shown, 'definition_version_id', null,
      'formula_sha256', encode(clara._hash(comp), 'hex'), 'statutory_eligible', false, 'preview', true));
end $core$;
revoke all on function clara._eta_compose_metric_preview_core_v2(uuid,uuid,uuid,text,uuid,jsonb,uuid[],uuid,text) from public;

create function clara.wake_compose_metric_preview_v2(p_client uuid, p_ast jsonb, p_period_ids uuid[],
    p_snapshot_id uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_compose_metric_preview_v2');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake metric preview needs its idempotency key' using errcode = 'CLR10', detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  return clara._eta_compose_metric_preview_core_v2(w.firm_id, clara.agent_user_id(), w.on_behalf_of,
    w.wake_kind, p_client, p_ast, p_period_ids, p_snapshot_id, p_op_key);
end $$;
revoke all on function clara.wake_compose_metric_preview_v2(uuid,jsonb,uuid[],uuid,text) from public;
grant execute on function clara.wake_compose_metric_preview_v2(uuid,jsonb,uuid[],uuid,text) to clara_wake_interactive;
insert into clara.wake_fn_allowlist(wake_kind, function_name)
  values ('interactive', 'wake_compose_metric_preview_v2')
  on conflict do nothing;

-- =====================================================================================
-- SECTION 8 -- THE EVALUATOR-VERSION WALL (design SS3.2 item 6, BL-4, R-CD-1).
--
-- THIS IS THE HIGHEST-RISK CHANGE IN THIS FILE AND IT SAYS SO. clara._tf_metric_cell_integrity is
-- the constraint trigger that re-derives every metric cell from its own inputs and refuses any row
-- that is not its deterministic evaluator result. A mistake here either silently accepts a
-- malformed v2-composed cell or silently breaks v1's existing re-derivation. B5.1 (a v1-composed
-- cell replays byte-identically through the widened trigger) and B5.2 (a v2-composed cell is
-- accepted through the new branch, and a hand-forged one claiming the v2 literal is refused) are
-- the two cells that must both be green before this is considered safe.
--
-- THE FILE 0060 IS NOT EDITED. Applied migration files are immutable; the LIVE FUNCTION they
-- defined is what a later migration replaces (packages/db/README.md's own distinction).
--
-- BL-4 -- FOUR HARDCODED v1 REFERENCES IN THE DEFINITIONLESS BRANCH, NOT TWO. (1) the
-- _metric_eval_node_v1 re-derivation call, (2) the validate_metric_ast_v1 re-validation call,
-- (3) the LITERAL STRING comparison against v1's entrypoint signature at 0060:253 -- which makes
-- this a VERSION-DISPATCHED wall, not merely a caller -- and (4) _normalize_metric_node_v1, which
-- is VERIFIED BENIGN for `cell` and is reused UNCHANGED by both branches. This recut retargets
-- (1)-(3) and leaves (4) exactly where it is.
--
-- ONE CONJUNCT IS ADDED THAT THE DESIGN DID NOT NAME, AND IT IS A STRENGTHENING (review law 3 --
-- SPELLING IS NOT IDENTITY). The entrypoint literal is a NAME; the evaluator version row is the
-- THING. Branching on the literal alone would let a row claim the v2 literal while carrying v1's
-- evaluator_version_id (or the reverse), and the trigger would then re-derive through functions the
-- cell does not actually claim. The new conjunct requires the claimed literal to EQUAL the
-- entrypoint_signature of the row's OWN evaluator_version_id. This holds unchanged for every
-- v1-composed cell in the estate -- B5.1 is what proves that rather than this comment.
--
-- BL-5 and M6 ARE RE-CHECKED ON THE v2 ARM, TRANSITIVELY AND DELIBERATELY. This body does not walk
-- the AST looking for `cell` nodes: validate_metric_ast_v2 and _metric_eval_node_v2 each raise
-- metric_cell_reference_not_definition_backed / _not_ok / metric_cell_context_mismatch themselves,
-- from inside the two calls below, so every cell node in the composition is re-proven at INSERT
-- time by the same code that proved it at compose time. A separate walk here would be a SECOND
-- implementation of the same predicate, which is how two walls drift apart. Stated so the absence
-- reads as a decision rather than an omission.
-- =====================================================================================
create or replace function clara._tf_metric_cell_integrity() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $cell$
declare c record; d record; z jsonb; na jsonb; expected_inputs jsonb; expected_reason uuid; edge_id uuid; average_id uuid; average_key text; v clara.metric_value_v1; root_period uuid; root_start date; periods uuid[]; factor numeric; q numeric; rem numeric; shown text;
  v_entry text; v_row_entry text;
  v_entry_v1 constant text := 'clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)';
  v_entry_v2 constant text := 'clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)';
begin
  select ec.evaluator_version_id,ec.run_id,ec.snapshot_id,s.books_watermark into c
    from clara.metric_evaluation_contexts ec join clara.metric_input_snapshots s on s.id=ec.snapshot_id
    where ec.id=new.evaluation_context_id and ec.firm_id=new.firm_id and ec.client_id=new.client_id;
  if not found or c.evaluator_version_id<>new.evaluator_version_id or c.run_id<>new.run_id or c.books_watermark<>new.books_watermark then
    raise exception 'cell context/evaluator/run/books-watermark binding is false' using errcode='CLR11';end if;
  if new.model_proposal_id is not null or new.human_approval_id is not null or new.supersedes_cell_id is not null
     or new.model_proposal_provenance is distinct from '{"kind":"not_applicable","version":1,"reason":"evaluator_originated"}'::jsonb
     or new.human_approval_provenance is distinct from '{"kind":"not_applicable","version":1,"reason":"no_numeric_approval"}'::jsonb then
    raise exception 'cell proposal, approval, or supersession provenance is not exact v1 evaluator provenance'using errcode='CLR11';end if;
  if new.definition_version_id is null then
    z:=new.inputs->'composition';
    v_entry:=z->>'evaluator_entrypoint';
    if new.inputs->>'schema' is distinct from 'clara.metric-composition-inputs/v1' or jsonb_typeof(z) is distinct from 'object'
       or (v_entry is distinct from v_entry_v1 and v_entry is distinct from v_entry_v2) or z#>'{ast,root}' is distinct from clara._normalize_metric_node_v1(z#>'{ast,root}')
       or clara._hash(z) is distinct from new.formula_sha256 or(case z#>>'{ast,unit}' when'currency'then'money'else z#>>'{ast,unit}'end) is distinct from new.unit_key or(new.cell_status='ok'and(z#>>'{ast,result_scale}')::smallint is distinct from new.displayed_scale)then
      raise exception 'cell lacks a definition and a hash-bound typed composition path' using errcode='CLR11';
    end if;
    -- SPELLING IS NOT IDENTITY: the claimed entrypoint literal must BE this row's own evaluator
    -- version's entrypoint, not merely a string this trigger recognises.
    select ev.entrypoint_signature into v_row_entry from clara.evaluator_versions ev where ev.id=new.evaluator_version_id;
    if v_row_entry is distinct from v_entry then
      raise exception 'cell composition entrypoint does not match its own evaluator version'using errcode='CLR11';end if;
    if v_entry=v_entry_v1 then perform clara.validate_metric_ast_v1(z->'ast');
    else perform clara.validate_metric_ast_v2(z->'ast',new.firm_id,new.client_id);end if;
    average_key:=coalesce(z->>'averaging_policy','avg_month_end_v1');select id into edge_id from clara.edge_policy_sets where policy_set_key=z#>>'{ast,edge_policy_set}'and(firm_id is null or firm_id=new.firm_id)order by firm_id nulls last,version desc limit 1;select id into average_id from clara.averaging_policy_versions where policy_key=average_key and(firm_id is null or firm_id=new.firm_id)and implemented order by firm_id nulls last,version desc limit 1;select array_agg(period_id order by ordinal)into periods from clara.metric_evaluation_context_periods where context_id=new.evaluation_context_id;root_period:=periods[1];if edge_id is null or average_id is null or root_period is null then raise exception 'composition policies or root period are absent'using errcode='CLR11';end if;
    if v_entry=v_entry_v1 then
      v:=clara._metric_eval_node_v1(new.client_id,c.snapshot_id,new.evaluation_context_id,root_period,z#>'{ast,root}',coalesce((z->>'allow_negative')::boolean,false),average_key,null);
    else
      v:=clara._metric_eval_node_v2(new.firm_id,new.client_id,c.snapshot_id,new.evaluation_context_id,root_period,z#>'{ast,root}',coalesce((z->>'allow_negative')::boolean,false),average_key,null);
    end if;
    if new.resolved_inputs_sha256<>clara._metric_resolved_inputs_sha256_v1((select context_sha256 from clara.metric_evaluation_contexts where id=new.evaluation_context_id),periods,new.firm_id,new.client_id,null,new.formula_sha256,v.account_set_version_ids,v.constant_version_ids,edge_id,average_id,new.evaluator_version_id,new.books_watermark)then raise exception 'composition resolved inputs hash does not reconstruct'using errcode='CLR11';end if;
    if v.status='ok'then factor:=power(10::numeric,(z#>>'{ast,result_scale}')::smallint);q:=div(abs(v.numerator)*factor,v.denominator);rem:=mod(abs(v.numerator)*factor,v.denominator);if rem*2>=v.denominator then q:=q+1;end if;shown:=to_char((case when v.numerator<0 then-q else q end)/factor,'FM999999999999999999999999999999999999999999999999990'||case when(z#>>'{ast,result_scale}')::smallint>0 then'.'||repeat('0',(z#>>'{ast,result_scale}')::smallint)else''end);end if;
    if v.status<>new.cell_status or v.reason_key is distinct from(select reason_key from clara.metric_na_reason_versions where id=new.na_reason_version_id) or(case when v.status='ok'then v.numerator end)is distinct from new.exact_numerator or(case when v.status='ok'then v.denominator end)is distinct from new.exact_denominator or shown is distinct from new.displayed_text then
      raise exception 'composition cell is not its deterministic evaluator result' using errcode='CLR11';end if;
  else
    select dv.firm_id,dv.formula_sha256,dv.unit_key,dv.result_scale,dv.ast,dv.allow_negative,dv.edge_policy_set_id,dv.averaging_policy_id,ap.policy_key into d from clara.metric_definition_versions dv join clara.metric_definitions md on md.id=dv.definition_id join clara.averaging_policy_versions ap on ap.id=dv.averaging_policy_id where dv.id=new.definition_version_id and md.firm_id is not distinct from dv.firm_id and dv.state in('firm_approved','canonical')and dv.approved_formula_sha256=dv.formula_sha256;
    if not found or(d.firm_id is not null and d.firm_id is distinct from new.firm_id)or d.formula_sha256<>new.formula_sha256 or d.unit_key<>new.unit_key or(new.cell_status='ok'and d.result_scale<>new.displayed_scale)then raise exception 'cell definition identity/lifecycle/hash/unit/result-scale binding is false'using errcode='CLR11';end if;
    select array_agg(period_id order by ordinal)into periods from clara.metric_evaluation_context_periods where context_id=new.evaluation_context_id;root_period:=periods[1];v:=clara._metric_eval_node_v1(new.client_id,c.snapshot_id,new.evaluation_context_id,root_period,d.ast->'root',d.allow_negative,d.policy_key,null);
    if root_period is null or new.resolved_inputs_sha256<>clara._metric_resolved_inputs_sha256_v1((select context_sha256 from clara.metric_evaluation_contexts where id=new.evaluation_context_id),periods,new.firm_id,new.client_id,new.definition_version_id,new.formula_sha256,v.account_set_version_ids,v.constant_version_ids,d.edge_policy_set_id,d.averaging_policy_id,new.evaluator_version_id,new.books_watermark)then raise exception 'cell resolved inputs hash does not reconstruct'using errcode='CLR11';end if;
    if v.status='ok'then factor:=power(10::numeric,d.result_scale);q:=div(abs(v.numerator)*factor,v.denominator);rem:=mod(abs(v.numerator)*factor,v.denominator);if rem*2>=v.denominator then q:=q+1;end if;shown:=to_char((case when v.numerator<0 then-q else q end)/factor,'FM999999999999999999999999999999999999999999999999990'||case when d.result_scale>0 then'.'||repeat('0',d.result_scale)else''end);end if;
    if v.status<>new.cell_status or v.reason_key is distinct from(select reason_key from clara.metric_na_reason_versions where id=new.na_reason_version_id)or(case when v.status='ok'then v.numerator end)is distinct from new.exact_numerator or(case when v.status='ok'then v.denominator end)is distinct from new.exact_denominator or shown is distinct from new.displayed_text then raise exception 'cell is not its deterministic evaluator result'using errcode='CLR11';end if;
  end if;
  if new.cell_status='ok' then if new.na_reason_version_id is not null or new.exact_numerator is null or new.exact_denominator is null or new.exact_denominator<=0 then raise exception 'an ok cell has malformed exact value or N/A reason' using errcode='CLR10'; end if;
  else
    /* i3: the N/A wording is resolved PERIOD-EFFECTIVELY against the ROOT reporting period's period_start -- the same anchor evaluate_metric_v1 uses, and the same idiom as account-set version and pack definition admission -- with the highest version breaking a co-effective tie. Wall and writer therefore cannot select different wording for the same cell. */
    select period_start into root_start from clara.metric_evaluation_context_periods where context_id=new.evaluation_context_id and period_id=root_period;if root_start is null then raise exception 'cell N/A reason has no root reporting period to resolve against'using errcode='CLR11';end if;
    select id into expected_reason from clara.metric_na_reason_versions where firm_id is null and reason_key=v.reason_key and effective_from<=root_start and(effective_to is null or effective_to>=root_start)order by version desc limit 1;
    if expected_reason is null or new.na_reason_version_id is distinct from expected_reason then raise exception 'cell N/A reason version is not the exact period-effective evaluator-selected version'using errcode='CLR10';end if;
  end if;
  na:=jsonb_build_object('presentation_map_versions',jsonb_build_object('version',1,'reason','definition_has_no_presentation_map_binding'),'model_proposal',jsonb_build_object('version',1,'reason','evaluator_originated'),'human_approval',jsonb_build_object('version',1,'reason','no_numeric_approval'),'supersession',jsonb_build_object('version',1,'reason','first_mint'));
  if cardinality(v.document_ids)=0 then na:=na||jsonb_build_object('documents',jsonb_build_object('version',1,'reason','no_document-backed_input_rows'));end if;
  expected_inputs:=coalesce(v.inputs,'{}')||jsonb_build_object('normalized_provenance',jsonb_build_object('period_ids',periods,'snapshot_ids',array[c.snapshot_id],'account_set_version_ids',array(select x from unnest(v.account_set_version_ids)x order by x),'constant_version_ids',array(select x from unnest(v.constant_version_ids)x order by x),'entry_ids',array(select x from unnest(v.entry_ids)x order by x),'document_ids',array(select x from unnest(v.document_ids)x order by x),'presentation_map_version_ids','{}'::uuid[]),'schema',case when new.definition_version_id is null then'clara.metric-composition-inputs/v1'else'clara.metric-cell-inputs/v1'end,'provenance_not_applicable',na);
  if new.definition_version_id is null then expected_inputs:=expected_inputs||jsonb_build_object('composition',z);end if;
  if new.inputs is distinct from expected_inputs then raise exception 'cell inputs/provenance are not the exact evaluator result'using errcode='CLR11';end if;
  return new;
end $cell$;
revoke all on function clara._tf_metric_cell_integrity() from public;

-- =====================================================================================
-- SECTION 8b -- THE FIFTH HARDCODED v1 REFERENCE, WHICH THE DESIGN'S OWN CENSUS MISSED.
--
-- BL-4 enumerated FOUR hardcoded v1 references and placed all four inside
-- clara._tf_metric_cell_integrity. There is a FIFTH, in a DIFFERENT trigger, and it is a hard
-- blocker rather than a nicety: clara._tf_metric_context_integrity (0060:228) admits an evaluation
-- context ONLY when its evaluator version's entrypoint_signature equals v1's literal. Until this
-- recut, NO v2 evaluation context could be inserted at all -- so stage (b) could not mint anything,
-- even with the closure registered and deployed. It was found by running the battery, not by
-- reading: the trigger is DEFERRABLE INITIALLY DEFERRED, so it fires at COMMIT and the refusal
-- surfaces from the wake wrapper rather than from the insert, which is why a source census over
-- _tf_metric_cell_integrity alone never saw it.
--
-- THE RECUT IS THE NARROWEST ONE THAT WORKS: the single-literal equality becomes a two-literal
-- admission, retargeted the same way BL-4 item 3 retargets the cell trigger's own comparison --
-- explicit literals, never generalised into a lookup, matching the estate's preference for
-- explicit literals in a security-critical wall. EVERY OTHER TERM IS BYTE-IDENTICAL: the deployed
-- requirement, the evaluator_name check, the firm-scoping arm, the entrypoint-is-a-member
-- requirement, the snapshot binding, and the context-hash reconstruction all stand exactly as
-- 0060 wrote them.
--
-- WHAT IT DOES NOT LOOSEN: the admitted set is closed to two named literals, so a context claiming
-- ANY other evaluator -- including a firm-scoped row, an undeployed one, or a v3 that does not
-- exist -- still refuses with the same token. Battery cell B4.11 forces exactly that.
-- =====================================================================================
create or replace function clara._tf_metric_context_integrity() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $context$
declare s record;p uuid[];
begin
  if not exists(select 1 from clara.evaluator_versions e where e.id=new.evaluator_version_id and e.deployed and e.evaluator_name='evaluate_metric' and e.entrypoint_signature in('clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)','clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)')and(e.firm_id is null or e.firm_id=new.firm_id)and exists(select 1 from clara.evaluator_version_members m where m.evaluator_version_id=e.id and m.member_signature=e.entrypoint_signature))then raise exception 'evaluation context evaluator identity is absent, undeployed, or cross-firm'using errcode='CLR11';end if;
  select producer_version_id,dataset_sha256,books_watermark into s from clara.metric_input_snapshots where id=new.snapshot_id and firm_id=new.firm_id and client_id=new.client_id;
  select array_agg(period_id order by ordinal)into p from clara.metric_evaluation_context_periods where context_id=new.id;
  if s.dataset_sha256 is null or p is null or new.context_sha256<>clara._metric_context_sha256_v1(new.snapshot_id,p,new.firm_id,new.client_id,s.producer_version_id,new.evaluator_version_id,s.dataset_sha256,s.books_watermark)then raise exception 'evaluation context hash does not reconstruct'using errcode='CLR11';end if;return new;
end $context$;
revoke all on function clara._tf_metric_context_integrity() from public;

-- =====================================================================================
-- SECTION 9 -- BL-6: clara.sandbox_exports gains the dispatch/cap half, and its lifecycle trigger
-- learns the six new MOVING columns (design SS2.6).
--
-- WITHOUT THIS, NOTHING BUILT ABOVE IS RENDERABLE END TO END. S13's registered gap: no CLAIM verb
-- ships in 0132 and no render_dispatch_begin/_record equivalent exists for this job family, so a
-- mint can succeed and a payload function can exist while no worker process ever transitions a row
-- from claimable to running to reach it.
--
-- max_attempts STAYS OUT OF THE MUTABLE ARRAY, mirroring clara.render_jobs' own precedent exactly:
-- it is part of the FROZEN REQUEST half, set once at request time, never runtime-mutated. B6.1a
-- forces that refusal; B6.1b re-proves the rest of the request half is still frozen; B6.1c proves
-- the terminal whole-row freeze does NOT carve out an exception for the six new columns.
-- =====================================================================================
alter table clara.sandbox_exports
  add column max_attempts        int not null default 5 check (max_attempts > 0),
  add column first_claimed_at    timestamptz,
  add column claim_delay_ms      bigint check (claim_delay_ms is null or claim_delay_ms >= 0),
  add column dispatch_attempts   int not null default 0 check (dispatch_attempts >= 0),
  add column last_dispatch_at    timestamptz,
  add column last_dispatch_ok    boolean,
  add column last_dispatch_error jsonb,
  add constraint ck_sandboxexports_claim_delay_paired
    check ((first_claimed_at is null) = (claim_delay_ms is null));

create or replace function clara._tf_sandbox_export_lifecycle() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare mutable text[] := array['state', 'attempts', 'claimed_by', 'claimed_at',
  'lease_expires_at', 'last_error', 'finished_at', 'artifact_sha256', 'byte_size', 'storage_key',
  -- BL-6: the six dispatch columns join the MOVING half. `max_attempts` deliberately does not --
  -- clara.render_jobs' own mutable list (0079:186-187) draws the line in exactly this place.
  'first_claimed_at', 'claim_delay_ms', 'dispatch_attempts', 'last_dispatch_at',
  'last_dispatch_ok', 'last_dispatch_error'];
begin
  if tg_op = 'DELETE' then
    raise exception 'a sandbox export is never deleted' using errcode = 'CLR08',
      detail = '{"reason":"sandbox_export_never_deleted"}';
  end if;
  if (to_jsonb(new) - mutable) is distinct from (to_jsonb(old) - mutable) then
    raise exception 'a sandbox export''s request is immutable' using errcode = 'CLR08',
      detail = '{"reason":"sandbox_export_request_immutable","fix":"request a new export; a changed request is a different export"}';
  end if;
  if old.state in ('done', 'failed') then
    if to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'a terminal sandbox export is immutable' using errcode = 'CLR08',
        detail = jsonb_build_object('reason', 'sandbox_export_terminal', 'state', old.state,
          'fix', 'a finished export records what happened; request a new one rather than editing a closed one')::text;
    end if;
    return new;
  end if;
  return new;
end $$;
revoke all on function clara._tf_sandbox_export_lifecycle() from public;

-- =====================================================================================
-- SECTION 10 -- THE SANDBOX JOB FAMILY's CLAIM / DISPATCH / REAP VERBS (design SS2.6, BL-6).
--
-- These MIRROR clara.render_jobs' own verbs, retargeted -- a SIBLING job family exactly as C-11
-- rules for the sandbox lane generally. render_jobs' verbs are not touched.
--
-- N7 -- TWO RETARGETS THAT ARE NOT RENAMES. clara.sandbox_exports has `created_at`, not
-- render_jobs' `enqueued_at`, so the oldest-first ordering key and the claim-delay arithmetic both
-- key off created_at. And the lease CLAMP is carried verbatim, not paraphrased: a caller-supplied
-- lease is the one input claim takes, and an absurd one would either strand the row for a day or
-- let two workers overlap within a minute.
--
-- THE RETRY CAP IS ENFORCED IN THE CLAIM PREDICATE ITSELF, not only on the failure path (0081's
-- own codex-B1 finding, which cost real money to learn): a CRASH-ONLY job never reaches
-- fail_sandbox_export, its lease expires, it becomes claimable again, and without
-- `attempts < max_attempts` its attempts climb past the cap forever, starting another paid machine
-- every cycle. A cap enforced only on the cooperative path is not a cap. B6.2 forces the ceiling at
-- the cap itself, not one below it.
-- =====================================================================================
create function clara.claim_sandbox_export(p_worker text, p_lease interval default interval '20 minutes')
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare e record; v_worker text;
begin
  v_worker := nullif(btrim(coalesce(p_worker, '')), '');
  if v_worker is null then
    raise exception 'a sandbox render worker claims under its own instance id' using errcode = 'CLR43',
      detail = '{"reason":"sandbox_worker_id_required"}';
  end if;
  update clara.sandbox_exports e0
     set state = 'running', claimed_by = v_worker, claimed_at = now(),
         lease_expires_at = now() + greatest(interval '1 minute',
                                             least(coalesce(p_lease, interval '20 minutes'),
                                                   interval '6 hours')),
         attempts = e0.attempts + 1,
         first_claimed_at = coalesce(e0.first_claimed_at, now()),
         claim_delay_ms = coalesce(e0.claim_delay_ms,
           (extract(epoch from (now() - e0.created_at)) * 1000)::bigint)
   where e0.id = (
     select c.id from clara.sandbox_exports c
      where (c.state = 'claimable'
             or (c.state = 'running' and c.lease_expires_at < now()))
        and c.attempts < c.max_attempts
      order by c.created_at, c.id
      for update skip locked
      limit 1)
   returning * into e;
  if not found then return null; end if;
  return jsonb_build_object(
    'sandbox_export_id', e.id, 'firm_id', e.firm_id, 'sandbox_view_id', e.sandbox_view_id,
    'recipient_id', e.recipient_id, 'locale', e.locale,
    'claimed_by', e.claimed_by, 'lease_expires_at', e.lease_expires_at,
    'attempts', e.attempts, 'max_attempts', e.max_attempts,
    'claim_delay_ms', e.claim_delay_ms);
end $$;
revoke all on function clara.claim_sandbox_export(text, interval) from public;

-- QUEUE HYGIENE. A row that burned every attempt without a worker ever reporting is parked FAILED
-- and SAID SO -- the sandbox-lane twin of reap_exhausted_render_jobs (0081:302-334). SKIP LOCKED
-- for the same reason: a worker inside fail_sandbox_export on an exhausted row must not stall
-- hygiene for every firm until its transaction ends.
--
-- WHAT THE RETURNED ARRAYS NAME. render_jobs returns reaped_run_ids because a run id points an
-- operator at the report that will not exist until they act. A sandbox_exports row has no
-- report_run_id, so BOTH identifiers travel: the export ids that were parked, and the
-- sandbox_view_ids whose documents will not exist -- the nearest equivalent "what would not exist
-- until you act" identifier the design names.
create function clara.reap_exhausted_sandbox_exports() returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_reaped int; v_export_ids uuid[]; v_view_ids uuid[];
begin
  with exhausted as (
    select e.id from clara.sandbox_exports e
     where e.state = 'running' and e.lease_expires_at < now() and e.attempts >= e.max_attempts
     for update of e skip locked),
  reaped as (
    update clara.sandbox_exports t
       set state = 'failed', finished_at = now(),
           claimed_by = null, claimed_at = null, lease_expires_at = null,
           last_error = jsonb_build_object('reason', 'failed_at_cap_without_report',
             'attempts', t.attempts, 'max_attempts', t.max_attempts,
             'detail', 'every claim was lost before the worker could record an outcome -- the workers crashed, were killed, or never reached fail_sandbox_export',
             'fix', 'inspect the sandbox render machine logs for the window this export was claimed in, then request a new export for this view once the cause is fixed')
      from exhausted x
     where t.id = x.id
    returning t.id, t.sandbox_view_id)
  select count(*)::int, coalesce(array_agg(distinct r.id), '{}'),
         coalesce(array_agg(distinct r.sandbox_view_id), '{}')
    into v_reaped, v_export_ids, v_view_ids
    from reaped r;
  return jsonb_build_object('reaped', coalesce(v_reaped, 0),
    'reaped_export_ids', to_jsonb(coalesce(v_export_ids, '{}'::uuid[])),
    'reaped_sandbox_view_ids', to_jsonb(coalesce(v_view_ids, '{}'::uuid[])));
end $$;
revoke all on function clara.reap_exhausted_sandbox_exports() from public;

-- THE LEADER'S DISPATCH READ. DUE ARITHMETIC IS DB-OWNED (the reconciler-fa.mjs law): the runtime
-- asks whether anything is due and is TOLD which exports; it never re-derives it. The attempt is
-- stamped HERE, before the machine call, so a failing dispatch backs off for the cooldown instead
-- of re-firing every cycle. A row under a LIVE lease is not due; an EXPIRED lease is due again.
create function clara.sandbox_dispatch_begin(p_cooldown interval default interval '10 minutes',
                                             p_max int default 5) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ids uuid[]; v_due int; v_oldest timestamptz; v_wait bigint;
begin
  with due as (
    select e.id from clara.sandbox_exports e
     where (e.state = 'claimable' or (e.state = 'running' and e.lease_expires_at < now()))
       -- Defence in depth: a row at its attempt cap is not dispatchable, because no worker can
       -- claim it. Without this term the sweep proposes it and a paid machine boots to find
       -- nothing claimable. The reap normally takes such a row first; this makes the due-read
       -- correct on its own.
       and e.attempts < e.max_attempts
       and (e.last_dispatch_at is null
            or e.last_dispatch_at < now() - coalesce(p_cooldown, interval '10 minutes'))
     order by e.created_at, e.id
     limit greatest(1, least(coalesce(p_max, 5), 100))
     for update of e skip locked),
  stamped as (
    update clara.sandbox_exports e
       set dispatch_attempts = e.dispatch_attempts + 1, last_dispatch_at = now(),
           last_dispatch_ok = null
      from due where e.id = due.id
    returning e.id, e.created_at)
  select coalesce(array_agg(s.id order by s.created_at, s.id), '{}'), count(*)::int,
         min(s.created_at)
    into v_ids, v_due, v_oldest
    from stamped s;
  v_wait := case when v_oldest is null then null
                 else (extract(epoch from (now() - v_oldest)))::bigint end;
  return jsonb_build_object(
    'due', coalesce(v_due, 0), 'export_ids', to_jsonb(v_ids),
    'oldest_created_at', v_oldest, 'oldest_wait_seconds', v_wait);
end $$;
revoke all on function clara.sandbox_dispatch_begin(interval, int) from public;

-- THE DISPATCH RECEIPT. "No render appeared" and "we could not start the renderer" are different
-- facts and only the second is actionable, so a failure is recorded ON THE ROW rather than logged
-- and forgotten. TERMINAL ROWS ARE SKIPPED, NOT WRITTEN (0081's own round-2 finding): the receipt
-- is written AFTER the machine round-trip and a row in that batch can legitimately turn done or
-- failed inside the window; the terminal wall refuses any change to such a row and would roll back
-- the WHOLE batch. `skipped` is returned rather than swallowed.
create function clara.sandbox_dispatch_record(p_export_ids uuid[], p_ok boolean, p_detail jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_n int; v_asked int;
begin
  if p_ok is null then
    raise exception 'a dispatch receipt states whether the start succeeded' using errcode = 'CLR43',
      detail = '{"reason":"sandbox_dispatch_outcome_required"}';
  end if;
  v_asked := coalesce(array_length(coalesce(p_export_ids, '{}'::uuid[]), 1), 0);
  update clara.sandbox_exports e
     set last_dispatch_ok = p_ok,
         last_dispatch_error = case when p_ok then null else coalesce(p_detail, '{}'::jsonb) end
   where e.id = any (coalesce(p_export_ids, '{}'::uuid[]))
     and e.state not in ('done', 'failed');
  get diagnostics v_n = row_count;
  return jsonb_build_object('recorded', v_n, 'skipped', greatest(v_asked - v_n, 0), 'ok', p_ok);
end $$;
revoke all on function clara.sandbox_dispatch_record(uuid[], boolean, jsonb) from public;

grant execute on function
  clara.claim_sandbox_export(text, interval),
  clara.sandbox_dispatch_begin(interval, int),
  clara.sandbox_dispatch_record(uuid[], boolean, jsonb),
  clara.reap_exhausted_sandbox_exports()
  to clara_runtime;

reset role;

-- =====================================================================================
-- SECTION 11 -- THE TAIL CENSUS. Read from the LIVE CATALOG, never asserted from prose, and
-- reproducing 0132's SECTION 10 shape rather than editing it. Where a claim is only checkable
-- against a function's SOURCE (a mutable-array membership, a literal-string branch), the census
-- says so and NAMES the battery cell that proves it behaviourally -- a source read is a projection
-- of the thing, not the thing.
-- =====================================================================================
do $tail$
declare
  v_n int; v_sig text; v_verb text; v_expected_grantee text; v_grantees text[];
  v_body text; v_check text; v_search_path_ok boolean; v_owner_check boolean;
  v_deployed boolean; v_members int; v_cols text[];
begin
  if current_user <> (select v from _card1_pre where k = 'deploy_user')
     or current_role <> (select v from _card1_pre where k = 'deploy_role') then
    raise exception 'card1 seam tail: role not reset (user %, role %)', current_user, current_role using errcode = 'CLR10';
  end if;

  -- (a) THE TWELFTH PRIMITIVE. 0059's own `if n<>11` line stays as printed forever; this is that
  -- census REPRODUCED at 12, never an edit of it.
  select count(*) into v_n from clara.metric_primitives;
  if v_n <> 12 then
    raise exception 'card1 seam tail: primitive closure %, expected 12', v_n using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.metric_primitives where primitive_key = 'cell') then
    raise exception 'card1 seam tail: the cell primitive row is absent' using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_check from pg_constraint
   where conrelid = 'clara.metric_primitives'::regclass and conname = 'metric_primitives_primitive_key_check';
  if v_check is null or v_check not like '%''cell''%' then
    raise exception 'card1 seam tail: the widened primitive_key CHECK is absent or does not admit cell -- live: %', coalesce(v_check,'(none)') using errcode = 'CLR10';
  end if;
  -- EXTEND-ONLY, BOTH DIRECTIONS: the eleven that were there before must all still be admitted.
  foreach v_sig in array array['measure','sum','average','lag','subtract','divide','days_in_period','percent_change','multiply','constant','count'] loop
    if v_check not like '%''' || v_sig || '''%' then
      raise exception 'card1 seam tail: the widened primitive_key CHECK dropped the existing literal %', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- (b) THE v2 CLOSURE: registered, NINE members, entrypoint countable exactly once, and BORN
  -- UNDEPLOYED. The deploy state is asserted POSITIVELY -- "not deployed" is the claim BL-3 makes,
  -- so it is read, not inferred from the absence of a flip statement in this file.
  select deployed into v_deployed from clara.evaluator_versions
   where evaluator_name = 'evaluate_metric' and version = 2 and firm_id is null;
  if v_deployed is null then
    raise exception 'card1 seam tail: the (evaluate_metric, 2) closure row is absent' using errcode = 'CLR10';
  end if;
  if v_deployed then
    raise exception 'card1 seam tail: (evaluate_metric, 2) is DEPLOYED -- this file must leave it dark; the flip is a separate ceremony act under the bare migration principal' using errcode = 'CLR10';
  end if;
  select count(*) into v_members from clara.evaluator_version_members m
    join clara.evaluator_versions e on e.id = m.evaluator_version_id
   where e.evaluator_name = 'evaluate_metric' and e.version = 2;
  if v_members <> 9 then
    raise exception 'card1 seam tail: (evaluate_metric, 2) carries % member(s), expected 9', v_members using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.evaluator_version_members m
    join clara.evaluator_versions e on e.id = m.evaluator_version_id
   where e.evaluator_name = 'evaluate_metric' and e.version = 2
     and m.member_signature = e.entrypoint_signature;
  if v_n <> 1 then
    raise exception 'card1 seam tail: (evaluate_metric, 2) counts % entrypoint member(s), expected exactly 1 -- verify_evaluator_freeze refuses on anything else', v_n using errcode = 'CLR10';
  end if;
  -- v1 IS UNTOUCHED: same ten members, same closure hash it always had. A recut of a v1 member
  -- would already have failed migrate.mjs's own verifier, but this is the positive read.
  select count(*) into v_n from clara.evaluator_version_members m
    join clara.evaluator_versions e on e.id = m.evaluator_version_id
   where e.evaluator_name = 'evaluate_metric' and e.version = 1;
  if v_n <> 10 then
    raise exception 'card1 seam tail: (evaluate_metric, 1) now carries % member(s), expected its original 10', v_n using errcode = 'CLR10';
  end if;
  perform clara.verify_evaluator_freeze();

  -- (c) EVERY FUNCTION THIS FILE MINTED OR REPLACED is SECURITY DEFINER, owned by clara_fn_owner,
  -- and pins search_path -- the cores and triggers too, not only the grantable verbs.
  select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
      and ('search_path=clara, pg_temp' = any(p.proconfig))) into v_owner_check
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara' and p.proname in (
      '_validate_metric_node_v2','validate_metric_ast_v2','_metric_eval_node_v2',
      'evaluate_metric_v2','_eta_compose_metric_preview_core_v2','wake_compose_metric_preview_v2',
      'claim_sandbox_export','sandbox_dispatch_begin','sandbox_dispatch_record',
      'reap_exhausted_sandbox_exports','_sandbox_client_set','sandbox_export_payload',
      '_tf_sandbox_export_lifecycle','_tf_metric_cell_integrity','_tf_metric_context_integrity');
  if not coalesce(v_owner_check, false) then
    raise exception 'card1 seam tail: a minted or replaced function is not definer / clara_fn_owner-owned / search_path-pinned' using errcode = 'CLR10';
  end if;

  -- (d) EXECUTE GRANTEES, EXACT SETS, DERIVED FROM EACH FUNCTION'S OWN ACL (0132:1404-1447's
  -- aclexplode shape, reproduced). A fixed candidate list can only find extras among names it
  -- already thought to ask about; aclexplode surfaces every role that was actually granted.
  -- clara_fn_owner is excluded because the owner's implicit privilege materialises into an
  -- explicit aclitem the moment any grant touches the object -- it was never part of the
  -- "exact application grantee" universe.
  for v_verb, v_expected_grantee in
    select * from (values
      ('claim_sandbox_export(text,interval)', 'clara_runtime'),
      ('sandbox_dispatch_begin(interval,integer)', 'clara_runtime'),
      ('sandbox_dispatch_record(uuid[],boolean,jsonb)', 'clara_runtime'),
      ('reap_exhausted_sandbox_exports()', 'clara_runtime'),
      ('sandbox_export_payload(uuid,text)', 'clara_runtime'),
      ('wake_compose_metric_preview_v2(uuid,jsonb,uuid[],uuid,text)', 'clara_wake_interactive'),
      ('evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)', 'clara_authenticated')
    ) t(sig, grantee)
  loop
    select coalesce(array_agg(distinct rolname order by rolname), '{}') into v_grantees
      from (
        select case when a.grantee = 0 then 'public' else r.rolname end as rolname
          from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          left join pg_roles r on r.oid = a.grantee
         where p.oid = ('clara.' || v_verb)::regprocedure
           and a.privilege_type = 'EXECUTE'
      ) g
     where g.rolname <> 'clara_fn_owner';
    if v_grantees is distinct from array[v_expected_grantee] then
      raise exception 'card1 seam tail: clara.% grantees are %, expected exactly %', v_verb, v_grantees, v_expected_grantee using errcode = 'CLR10';
    end if;
    select ('search_path=clara, pg_temp' = any(p.proconfig)) into v_search_path_ok
      from pg_proc p where p.oid = ('clara.' || v_verb)::regprocedure;
    if not coalesce(v_search_path_ok, false) then
      raise exception 'card1 seam tail: clara.% does not pin search_path=clara, pg_temp', v_verb using errcode = 'CLR10';
    end if;
  end loop;

  -- (e) THE UNGRANTED CORES ARE REACHABLE BY NOBODY. Same ACL-derived universe as (d).
  foreach v_sig in array array[
      '_validate_metric_node_v2(jsonb,uuid,uuid,integer)',
      'validate_metric_ast_v2(jsonb,uuid,uuid)',
      '_metric_eval_node_v2(uuid,uuid,uuid,uuid,uuid,jsonb,boolean,text,date)',
      '_eta_compose_metric_preview_core_v2(uuid,uuid,uuid,text,uuid,jsonb,uuid[],uuid,text)',
      '_sandbox_client_set(uuid,jsonb,jsonb)']
  loop
    select coalesce(array_agg(distinct rolname order by rolname), '{}') into v_grantees
      from (
        select case when a.grantee = 0 then 'public' else r.rolname end as rolname
          from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          left join pg_roles r on r.oid = a.grantee
         where p.oid = ('clara.' || v_sig)::regprocedure
           and a.privilege_type = 'EXECUTE'
      ) g
     where g.rolname <> 'clara_fn_owner';
    if coalesce(array_length(v_grantees,1),0) <> 0 then
      raise exception 'card1 seam tail: ungranted core clara.% is reachable by %', v_sig, v_grantees using errcode = 'CLR10';
    end if;
  end loop;

  -- (f) THE WAKE ALLOWLIST, BOTH DIRECTIONS. Exactly one new row, 'interactive' only, never
  -- proactive and never interactive_client -- and interactive_client's own one-row D34 invariant
  -- must still hold, i.e. THIS FILE MUST NOT HAVE TOUCHED IT.
  select count(*) into v_n from clara.wake_fn_allowlist where function_name = 'wake_compose_metric_preview_v2';
  if v_n <> 1 then
    raise exception 'card1 seam tail: expected exactly 1 allowlist row for wake_compose_metric_preview_v2, found %', v_n using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist
      where function_name = 'wake_compose_metric_preview_v2' and wake_kind <> 'interactive') then
    raise exception 'card1 seam tail: wake_compose_metric_preview_v2 is allowlisted for an unexpected wake_kind' using errcode = 'CLR10';
  end if;
  -- THE interactive_client WALL, ASSERTED AS A DIFFERENTIAL RATHER THAN A COUNT. What this file
  -- must prove is that it did not touch that kind's roster -- not that the roster has some
  -- particular size. The estate's own shared fixture
  -- (packages/db/tests/fixtures/wake-allowlist-roster.mjs) exists because these censuses "used to
  -- hard-equal a NUMBER", and a stale literal is how a closed world quietly stops being one:
  -- 0129's SS4 chat-parity copy and 0131's audited free read are both RULED widenings of this same
  -- kind, so any count written today is wrong by tomorrow. Comparing the prestate capture answers
  -- the real question and can say NO in both directions.
  if (select coalesce(string_agg(function_name, ',' order by function_name), '')
        from clara.wake_fn_allowlist where wake_kind = 'interactive_client')
     is distinct from (select v from _card1_pre where k = 'interactive_client_roster') then
    raise exception 'card1 seam tail: this file changed the interactive_client allowlist roster -- it must not touch that wake kind at all (was: %, now: %)',
      (select v from _card1_pre where k = 'interactive_client_roster'),
      (select coalesce(string_agg(function_name, ',' order by function_name), '') from clara.wake_fn_allowlist where wake_kind = 'interactive_client')
      using errcode = 'CLR10';
  end if;
  -- ...and F-A2's own pinned row is still there, read positively rather than inferred from the
  -- roster comparison above (which would also pass on an estate that never had it).
  if not exists (select 1 from clara.wake_fn_allowlist
      where wake_kind = 'interactive_client' and function_name = 'wake_open_question') then
    raise exception 'card1 seam tail: F-A2''s interactive_client|wake_open_question row is GONE' using errcode = 'CLR10';
  end if;
  -- wake_fn_allowlist's PK is (wake_kind, function_name) -- BARE NAME, no argument-type column --
  -- so an allowlist row is only as precise as its name is UNAMBIGUOUS. Prove exactly one
  -- regprocedure in schema clara answers to this bare name.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara' and p.proname = 'wake_compose_metric_preview_v2';
  if v_n <> 1 then
    raise exception 'card1 seam tail: wake_compose_metric_preview_v2 is ambiguous -- % overload(s) share this bare name', v_n using errcode = 'CLR10';
  end if;

  -- (g) clara.sandbox_exports carries all seven new columns and the paired CHECK.
  select coalesce(array_agg(column_name order by column_name), '{}') into v_cols
    from information_schema.columns
   where table_schema = 'clara' and table_name = 'sandbox_exports'
     and column_name in ('max_attempts','first_claimed_at','claim_delay_ms','dispatch_attempts',
                         'last_dispatch_at','last_dispatch_ok','last_dispatch_error');
  if coalesce(array_length(v_cols,1),0) <> 7 then
    raise exception 'card1 seam tail: clara.sandbox_exports carries % of the 7 dispatch columns: %', coalesce(array_length(v_cols,1),0), array_to_string(v_cols,', ') using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.sandbox_exports'::regclass
      and conname = 'ck_sandboxexports_claim_delay_paired') then
    raise exception 'card1 seam tail: ck_sandboxexports_claim_delay_paired is absent' using errcode = 'CLR10';
  end if;

  -- (h) FORCED RLS IS UNMOVED on every relation this file touched or read. No new table is minted,
  -- so the RLS-forced-relation census owes nothing; this is the both-directions re-proof that the
  -- two ALTERs did not disturb what was already there.
  foreach v_sig in array array['clara.sandbox_exports','clara.sandbox_views','clara.metric_cells'] loop
    if not exists (select 1 from pg_class where oid = v_sig::regclass and relrowsecurity and relforcerowsecurity) then
      raise exception 'card1 seam tail: % lost forced row level security', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  -- clara_runtime STILL holds no table privilege on clara.metric_cells: the widened payload
  -- function is the only door, and this is the read that proves it rather than the comment.
  foreach v_sig in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege('clara_runtime', 'clara.metric_cells', v_sig) then
      raise exception 'card1 seam tail: clara_runtime gained % on clara.metric_cells -- the widened payload function is meant to be the only door', v_sig using errcode = 'CLR10';
    end if;
    if has_table_privilege('clara_agent_ro', 'clara.metric_cells', v_sig) then
      raise exception 'card1 seam tail: clara_agent_ro gained % on clara.metric_cells', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- (i) THE SOURCE-LEVEL READS, LABELLED AS SUCH. Each of these is a projection of the thing --
  -- the behavioural proof is the battery cell named beside it.
  select prosrc into v_body from pg_proc where oid = 'clara._tf_sandbox_export_lifecycle()'::regprocedure;
  foreach v_sig in array array['first_claimed_at','claim_delay_ms','dispatch_attempts','last_dispatch_at','last_dispatch_ok','last_dispatch_error'] loop
    if v_body not like '%''' || v_sig || '''%' then
      raise exception 'card1 seam tail: the recut lifecycle trigger does not admit % as mutable (behavioural proof: B6.1a)', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  if v_body like '%''max_attempts''%' then
    raise exception 'card1 seam tail: the recut lifecycle trigger admits max_attempts as mutable -- it is frozen request half (behavioural proof: B6.1a)' using errcode = 'CLR10';
  end if;
  select prosrc into v_body from pg_proc where oid = 'clara._tf_metric_cell_integrity()'::regprocedure;
  if v_body not like '%clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)%'
     or v_body not like '%clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)%'
     or v_body not like '%_metric_eval_node_v2%' or v_body not like '%validate_metric_ast_v2%'
     or v_body not like '%_normalize_metric_node_v1%' then
    raise exception 'card1 seam tail: the recut integrity trigger does not carry both entrypoint literals plus the v2 re-derivation pair and the shared normalizer (behavioural proof: B5.1/B5.2)' using errcode = 'CLR10';
  end if;
  select prosrc into v_body from pg_proc where oid = 'clara._tf_metric_context_integrity()'::regprocedure;
  if v_body not like '%clara.evaluate_metric_v1(uuid,uuid,uuid[],uuid,uuid)%'
     or v_body not like '%clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)%'
     or v_body not like '%e.deployed%' or v_body not like '%_metric_context_sha256_v1%' then
    raise exception 'card1 seam tail: the recut context-integrity trigger does not admit BOTH entrypoints while keeping its deployed and hash-reconstruction terms (behavioural proof: B4.11)' using errcode = 'CLR10';
  end if;
  select prosrc into v_body from pg_proc where oid = 'clara._sandbox_client_set(uuid,jsonb,jsonb)'::regprocedure;
  if v_body not like '%sandbox_placeholder_basis_not_cell%' or v_body not like '%sandbox_placeholder_cell_not_ok%'
     or v_body not like '%placeholder_unknown_key%' then
    raise exception 'card1 seam tail: the recut client-set core is missing a placeholder refusal token (behavioural proof: B1.2/B1.3/B1.7)' using errcode = 'CLR10';
  end if;
  select prosrc into v_body from pg_proc where oid = 'clara.sandbox_export_payload(uuid,text)'::regprocedure;
  if v_body not like '%''cells''%' or v_body not like '%jsonb_to_recordset%' then
    raise exception 'card1 seam tail: the recut payload function does not carry the pinned cells pre-join (behavioural proof: B2.1/B2.2/B2.3)' using errcode = 'CLR10';
  end if;

  raise notice 'card1 seam OK: placeholder block kind admitted (text/placeholder/refuse, three arms); the payload pre-joins cited cells by their PINNED basis id only; the twelfth primitive `cell` is registered and its CHECK widened extend-only 11->12; the (evaluate_metric,2) closure is registered with 9 members, its entrypoint countable exactly once, and BORN UNDEPLOYED -- stage (b) is dark until its own ceremony; v1 still carries its original 10 members and verify_evaluator_freeze passes; _tf_metric_cell_integrity now dispatches on the composition entrypoint AND binds that literal to the row''s own evaluator version; clara.sandbox_exports carries the 7 dispatch/cap columns with max_attempts frozen out of the mutable half; four clara_runtime job verbs granted to clara_runtime and nobody else; one wake allowlist row, interactive only, and the interactive_client roster byte-identical to the prestate capture (this file did not touch that kind); clara_runtime and clara_agent_ro still hold NO table privilege on clara.metric_cells.';
end
$tail$;
