-- =====================================================================================
-- F-A3 PR-3 / C1-bis -- clara._agent_bank_receipt's conflict-identity check widens to the
-- FULL WRITTEN-FIELD SET. A recut-on-recut: 0129's SS5 already replaced this body once, and
-- this file replaces that result in turn.
--
-- WHY A NEW FILE RATHER THAN AN EDIT TO 0129. 0129 is applied history. `.claude/rules/db-
-- migrations.md`: "Applied files are immutable. The runner records each file's sha256, so
-- editing an applied migration trips a checksum-drift error. Fix forward with a new file."
-- That law is unconditional -- it does not soften because no durable database has applied
-- 0129 yet, because the SAME checksum ledger governs every rig and CI database that already
-- has, and because history that can be rewritten is not history. So: fix forward.
--
-- WHAT C1-bis FIXES -- THE WHO-MISATTRIBUTION COLLISION.
-- Review round 3's C1 widened the on-conflict identity check to include `outcome` and
-- `gate_verdicts`, closing "a refused receipt is silently reusable by a later successful act
-- on the same op_key". But it left out every column that records WHO acted. The collision
-- that survived:
--
--   1. A `bank_agent` act is Tier-B refused on op_key K. The stored row is
--      via_wake_kind='bank_agent', acting_actor=clara.agent_user_id(), outcome='refused'.
--   2. An `interactive_client` HUMAN then independently produces the same client / act_kind /
--      subject_id / inputs_digest / outcome / gate_verdicts on that SAME op_key K -- a name
--      collision, not a replay of the same act.
--   3. Every field C1 compares is identical, so the on-conflict branch reads back and returns
--      the OLD bank_agent-attributed row. The human's own receipt now permanently
--      misattributes who performed the act.
--
-- That is a durable provenance lie inside an audited receipt -- precisely what the receipt
-- exists to prevent, and the same class of defect 0129's own provenance recut was written to
-- close on the write side.
--
-- THE FIX. The comparison additionally covers acting_actor, on_behalf_of, via_wake_kind,
-- model_snapshot, rationale and approval_arm -- each compared either against the calling p_
-- parameter (model_snapshot vs p_model, rationale vs p_rationale) or against the SAME
-- clara.wake_context()-derived expression the INSERT itself uses, repeated VERBATIM rather
-- than hoisted into a shared variable, so the compare side cannot silently drift from the
-- insert side. A genuine change in any of them now forces a fresh op_key through the existing
-- CLR10 / op_key_identity_mismatch shape -- identical to every other identity mismatch this
-- function already raises, so no caller learns a new error contract.
--
-- THREE OF THE FIFTEEN WRITTEN COLUMNS ARE DELIBERATELY NOT COMPARED, AND ONLY THREE.
-- firm_id and op_key are the conflict target itself -- the read-back's own WHERE clause
-- already pins both, so comparing them could only ever be vacuously true. retry_after is an
-- ADVISORY when-to-retry hint, not a claim about what happened or who did it; binding it into
-- the identity set would be actively WRONG the moment a caller computes it from wall clock,
-- because a genuine idempotent replay landing a minute later would carry a different
-- now()-derived hint and be refused as an identity mismatch. Measured at this migration: no
-- caller passes it at all -- all thirteen agent bank cores omit the parameter and take its
-- null default -- so the exclusion is inert today and correct when that changes.
--
-- D1 WRITE-QUIESCE OBLIGATION -- OWED. This file REPLACES a live audited writer's body, the
-- same body 0129 replaced, so it carries the identical D1 obligation at ceremony: PostgreSQL
-- runs an in-flight PL/pgSQL call to completion on the body it STARTED with, so a
-- _agent_bank_receipt call spanning this migration silently keeps the C1-only comparison.
-- Deploy inside a write-quiesce window (packages/db/README.md, "Deploy contract"). Exactly one
-- body is replaced here; nothing else in this file writes, drops or grants anything.
--
-- NUMBERING. Numbers are claimed at MERGE time. This file authors as 0134 because the train
-- slots it to merge AFTER G1's 0133; 0131/0132/0133 are unmerged at authoring, so a branch
-- built from main sees 0129 -> 0130 -> 0134. The runner applies in numeric order and forbids
-- duplicates, not gaps, so the gap is validation-safe. If the train order changes, RENUMBER AT
-- MERGE -- nothing in this file depends on its own number.
--
-- No statement_timeout pin: this replaces one function body and reads pg_proc twice. There is
-- no scan and no lock beyond the body's own, so a timeout here would be decorative.
-- =====================================================================================

do $fa3pr3_c1bis$
declare
  -- THE SEARCH TARGET: the exact conflict-identity block 0129's own v_replacement_c1 installed.
  -- Read fresh from the live catalog below and matched against this -- never a whole body
  -- literal, so this file cannot silently erase a LATER migration's own patch on some other
  -- part of the same body (the F-A3/PR-1b superseded-body lesson: a CoR built from a
  -- migration's FILE TEXT rather than the live catalog erased a later dynamic patch).
  v_c1 text := $c1$    select id, firm_id, client_id, act_kind, subject_id, inputs_digest, outcome, gate_verdicts into v_existing
      from clara.bank_agent_receipts where firm_id = p_firm and op_key = p_op_key;
    if v_existing.client_id is distinct from p_client
       or v_existing.act_kind is distinct from p_act_kind or v_existing.subject_id is distinct from p_subject
       or v_existing.inputs_digest is distinct from v_digest
       or v_existing.outcome is distinct from p_outcome or v_existing.gate_verdicts is distinct from p_gate_verdicts then
      raise exception 'op_key % is already claimed by a different act; a replayed op_key must never return a receipt for another client/act/subject/digest/outcome', p_op_key
        using errcode='CLR10', detail='{"reason":"op_key_identity_mismatch"}';
    end if;$c1$;
  -- THE REPLACEMENT. Each wake_context()-derived comparison is byte-identical to the
  -- expression the INSERT's own VALUES clause uses for that same column (0129's v_replacement).
  v_c1bis text := $c1b$    select id, firm_id, client_id, act_kind, subject_id, inputs_digest, outcome, gate_verdicts,
        acting_actor, on_behalf_of, via_wake_kind, model_snapshot, rationale, approval_arm into v_existing
      from clara.bank_agent_receipts where firm_id = p_firm and op_key = p_op_key;
    if v_existing.client_id is distinct from p_client
       or v_existing.act_kind is distinct from p_act_kind or v_existing.subject_id is distinct from p_subject
       or v_existing.inputs_digest is distinct from v_digest
       or v_existing.outcome is distinct from p_outcome or v_existing.gate_verdicts is distinct from p_gate_verdicts
       or v_existing.acting_actor is distinct from
         (select case when w.wake_kind = 'interactive_client' then w.on_behalf_of else clara.agent_user_id() end from clara.wake_context() w)
       or v_existing.on_behalf_of is distinct from
         (select w.on_behalf_of from clara.wake_context() w where w.wake_kind = 'interactive_client')
       or v_existing.via_wake_kind is distinct from
         coalesce((select w.wake_kind from clara.wake_context() w), 'bank_agent')
       or v_existing.model_snapshot is distinct from p_model
       or v_existing.rationale is distinct from p_rationale
       or v_existing.approval_arm is distinct from
         (select case when w.wake_kind = 'interactive_client' then 'interactive_client_attended' else 'agent_unattended' end from clara.wake_context() w) then
      raise exception 'op_key % is already claimed by a different act; a replayed op_key must never return a receipt for another client/act/subject/digest/outcome/who', p_op_key
        using errcode='CLR10', detail='{"reason":"op_key_identity_mismatch"}';
    end if;$c1b$;
  v_sig text := 'clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamptz)';
  v_oid oid; v_def text; v_head text;
  v_pre text; v_post text; v_expected text; v_occ int;
begin
  -- F4: exact-signature resolution, matching 0129's own pin.
  v_oid := to_regprocedure(v_sig);
  if v_oid is null then
    raise exception 'F-A3 PR-3 C1-bis: clara._agent_bank_receipt does not resolve at its exact pinned signature'
      using errcode='CLR10';
  end if;
  v_def := pg_get_functiondef(v_oid);
  select p.prosrc into v_pre from pg_proc p where p.oid = v_oid;
  v_head := left(v_def, position(E'\nAS $function$' in v_def));
  if v_def <> v_head || 'AS $function$' || v_pre || '$function$' || E'\n' then
    raise exception 'F-A3 PR-3 C1-bis: clara._agent_bank_receipt does not split at the AS $function$ boundary into a uniquely-locatable header + prosrc'
      using errcode='CLR10';
  end if;

  -- PRESTATE (a): the pre-image fingerprint, for the ceremony record and the tail's byte-diff.
  -- Recorded, not hard-pinned to a literal: a literal sha would ALSO break on an unrelated
  -- recut of some other part of this body by a migration merging between authoring and
  -- ceremony, which is a train-ordering accident rather than a real premise failure. The
  -- load-bearing premise is (b) -- and (b) is what fails closed.
  raise notice 'F-A3 PR-3 C1-bis prestate: pre-image prosrc sha256 = %', encode(sha256(convert_to(v_pre,'UTF8')),'hex');

  -- PRESTATE (b), LOAD-BEARING: the C1 comparison block 0129 installed is present EXACTLY
  -- ONCE. Zero means 0129 never ran, or something already recut this block; more than one
  -- means the body is not what this file believes. Either way, patching on a wrong premise is
  -- the failure mode -- abort instead.
  v_occ := (length(v_pre) - length(replace(v_pre, v_c1, ''))) / length(v_c1);
  if v_occ <> 1 then
    raise exception 'F-A3 PR-3 C1-bis: clara._agent_bank_receipt does not carry 0129''s pinned C1 conflict-identity block exactly once (found %) -- re-derive before patching', v_occ
      using errcode='CLR10';
  end if;

  -- PRESTATE (c): the C1-bis block is NOT already present -- a positive read that this file has
  -- something to do, rather than inferring it from (b) alone.
  if position(v_c1bis in v_pre) > 0 then
    raise exception 'F-A3 PR-3 C1-bis: clara._agent_bank_receipt already carries the C1-bis comparison -- already recut; refusing to patch twice'
      using errcode='CLR10';
  end if;

  v_expected := replace(v_pre, v_c1, v_c1bis);
  execute v_head || 'AS $c1bis_receipt$' || v_expected || '$c1bis_receipt$';

  -- TAIL (byte-diff, F-A3/PR-1b lesson): re-read the LIVE body and prove it is the pre-image
  -- with the ONE intended substitution applied and nothing else. This is a read-back against
  -- an independently-derived expectation, not a restatement of what we sent -- it catches a
  -- write that landed on a different overload, or a body that came back altered.
  select p.prosrc into v_post from pg_proc p where p.oid = to_regprocedure(v_sig);
  if v_post is distinct from v_expected then
    raise exception 'F-A3 PR-3 C1-bis: the live body after the recut is NOT the pre-image with only the C1->C1-bis substitution applied -- something else moved; investigate before trusting this deploy'
      using errcode='CLR10';
  end if;
  raise notice 'F-A3 PR-3 C1-bis: recut applied -- post-image prosrc sha256 = %, byte-diff vs pre-image proves the SOLE change is the C1 -> C1-bis conflict-identity block (% char(s) added, no other byte moved)',
    encode(sha256(convert_to(v_post,'UTF8')),'hex'), length(v_post) - length(v_pre);
end
$fa3pr3_c1bis$;

-- Tail census -- an INDEPENDENT re-read of the live catalog, measuring the properties C1-bis is
-- actually about, not a restatement of the block above. A migration whose tail only says "OK"
-- has proven nothing.
do $fa3pr3_c1bis_census$
declare
  v_src text;
  v_expr text; v_occ int; v_bad int := 0;
  -- The four wake_context()-derived expressions. Each must appear EXACTLY TWICE in the live
  -- body: once in the INSERT's VALUES clause, once in the conflict comparison. Exactly one
  -- occurrence is the pre-C1-bis state (compare side missing); anything else means the two
  -- sides have drifted apart, which is the whole defect this file exists to close.
  v_exprs text[] := array[
    $x1$(select case when w.wake_kind = 'interactive_client' then w.on_behalf_of else clara.agent_user_id() end from clara.wake_context() w)$x1$,
    $x2$(select w.on_behalf_of from clara.wake_context() w where w.wake_kind = 'interactive_client')$x2$,
    $x3$coalesce((select w.wake_kind from clara.wake_context() w), 'bank_agent')$x3$,
    $x4$(select case when w.wake_kind = 'interactive_client' then 'interactive_client_attended' else 'agent_unattended' end from clara.wake_context() w)$x4$
  ];
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid = to_regprocedure('clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamptz)');

  foreach v_expr in array v_exprs loop
    v_occ := (length(v_src) - length(replace(v_src, v_expr, ''))) / length(v_expr);
    if v_occ <> 2 then
      v_bad := v_bad + 1;
      raise warning 'F-A3 PR-3 C1-bis census: expression occurs % time(s), expected 2 (insert side + compare side): %', v_occ, left(v_expr, 60);
    end if;
  end loop;
  if v_bad > 0 then
    raise exception 'F-A3 PR-3 C1-bis census: % of 4 wake_context()-derived expression(s) are NOT present on both the insert and the compare side', v_bad
      using errcode='CLR10';
  end if;

  -- The parameter-compared columns, each measured by name against its own comparison.
  if position('v_existing.model_snapshot is distinct from p_model' in v_src) = 0
     or position('v_existing.rationale is distinct from p_rationale' in v_src) = 0
     or position('v_existing.outcome is distinct from p_outcome' in v_src) = 0
     or position('v_existing.gate_verdicts is distinct from p_gate_verdicts' in v_src) = 0 then
    raise exception 'F-A3 PR-3 C1-bis census: a parameter-compared identity column is missing from the conflict check'
      using errcode='CLR10';
  end if;

  -- The read-back select list must NAME every column the comparison dereferences: v_existing is
  -- a plain `record`, so a field absent from the select list raises at RUNTIME, not at create.
  if position('acting_actor, on_behalf_of, via_wake_kind, model_snapshot, rationale, approval_arm into v_existing' in v_src) = 0 then
    raise exception 'F-A3 PR-3 C1-bis census: the read-back select list does not carry the six added identity columns -- v_existing is a record, so the comparison would fail at runtime'
      using errcode='CLR10';
  end if;

  -- NEGATIVE controls: the superseded wordings must be GONE. An absence measured deliberately,
  -- not inferred from the positives above.
  if position($old$another client/act/subject/digest/outcome', p_op_key$old$ in v_src) > 0 then
    raise exception 'F-A3 PR-3 C1-bis census: the superseded C1 error wording is still present -- the recut did not take'
      using errcode='CLR10';
  end if;
  if position('v_existing.retry_after' in v_src) > 0 then
    raise exception 'F-A3 PR-3 C1-bis census: retry_after is being compared -- it is an advisory hint and MUST stay out of the identity set (see this file''s header)'
      using errcode='CLR10';
  end if;

  -- Positive control on the census instrument itself: a string that MUST be there. Without it,
  -- an empty/unreadable prosrc would sail through every "is absent" check above.
  if position('insert into clara.bank_agent_receipts' in v_src) = 0 then
    raise exception 'F-A3 PR-3 C1-bis census: cannot read the function body at all -- every absence check above is meaningless'
      using errcode='CLR10';
  end if;

  raise notice 'F-A3 PR-3 C1-bis tail: OK -- the conflict-identity check now covers all 12 judgement-bearing written columns; all four wake_context()-derived comparisons are byte-identical to the INSERT''s own expressions (each present exactly twice, insert + compare); the six added columns are in the read-back select list; the superseded C1 wording is absent and retry_after is correctly NOT compared (advisory hint, deliberately excluded); firm_id/op_key remain the conflict target. One audited writer body replaced -- D1 write-quiesce owed at ceremony. No table in workflow/graphile_worker/spike touched; no relation, grant or policy altered by this file.';
end
$fa3pr3_c1bis_census$;
